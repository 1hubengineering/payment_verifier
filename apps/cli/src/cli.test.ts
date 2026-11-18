import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { retrieveTelebirr } from '@1hubengineering/receipt-verifier/providers';
import { runCli } from './cli.ts';
import { openOperatorRuntime } from './runtime.ts';
import type { OperatorConfiguration } from './runtime.ts';
import { runWorker } from '../../worker/src/loop.ts';

vi.mock('@1hubengineering/receipt-verifier/providers', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  retrieveTelebirr: vi.fn(() => {
    throw new Error('Unexpected provider traffic');
  }),
}));
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const syntheticKey = '0123456789abcdef'.repeat(4);
const expected = {
  tenantId: 'synthetic',
  paymentId: 'synthetic',
  provider: 'telebirr',
  currency: 'ETB',
  amountMinor: 1000,
  recipientName: 'Example Merchant',
  recipientAccountLast4: '1123',
  reference: 'AH-TEST-4821',
  validFrom: 0,
  validUntil: 4102444800000,
};
const input = {
  tenantId: 'synthetic',
  paymentId: 'synthetic',
  idempotencyKey: 'synthetic-key',
  receiptLocator: 'TEST1234AB',
};
let directory: string, configuration: OperatorConfiguration;
function file(name: string, value: unknown): string {
  const path = join(directory, name);
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  return path;
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'receipt-operator-'));
  configuration = {
    RECEIPT_TIMEOUT_MS: 1000,
    RECEIPT_DATABASE_FILE: join(directory, 'synthetic.sqlite'),
    RECEIPT_JOB_KEY: syntheticKey,
    RECEIPT_ALLOW_PROVIDER_TRAFFIC: false,
    RECEIPT_ENABLE_CBE: false,
  };
  vi.mocked(retrieveTelebirr).mockClear();
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('trusted operator CLI and durable worker', () => {
  it('keeps help and matching saved-HTML diagnostics outside every claim/storage path', async () => {
    expect(await runCli(['help'], configuration)).toContain('no database/claim');
    const html = readFileSync(
      new URL('../../../tests/reference-cli/fixtures/telebirr.v5-table.mock.html', import.meta.url),
      'utf8',
    );
    const result = await runCli(
      ['diagnose', file('expectation.json', expected), file('receipt.html', html)],
      configuration,
    );
    expect(result).toMatchObject({
      diagnostic: true,
      claimCreated: false,
      provenance: { kind: 'SAVED_HTML' },
      result: { verificationStatus: 'MATCHED_RECEIPT_ONLY', settlementStatus: 'UNCONFIRMED' },
    });
    expect(existsSync(configuration.RECEIPT_DATABASE_FILE!)).toBe(false);
    expect(retrieveTelebirr).not.toHaveBeenCalled();
  });
  it('bounds input and rejects malformed/authoritative submission fields before opening storage', async () => {
    await expect(
      runCli(['verify', file('oversized.json', 'x'.repeat(16001))], configuration),
    ).rejects.toMatchObject({ code: 'INVALID_FILE' });
    await expect(
      runCli(['verify', file('overrides.json', { ...input, amountMinor: 1 })], configuration),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      runCli(['register', file('invalid.json', { ...expected, amountMinor: 0.29 })], configuration),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      runCli(
        ['diagnose', file('valid.json', expected), file('huge.html', 'x'.repeat(2000001))],
        configuration,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FILE' });
    expect(existsSync(configuration.RECEIPT_DATABASE_FILE!)).toBe(false);
  });
  it('requires an explicit queue key and never infers provider opt-in', async () => {
    await expect(
      runCli(['enqueue', file('submission.json', input)], {
        ...configuration,
        RECEIPT_JOB_KEY: undefined,
      }),
    ).rejects.toMatchObject({ code: 'QUEUE_KEY_REQUIRED' });
    expect(existsSync(configuration.RECEIPT_DATABASE_FILE!)).toBe(false);
    await runCli(['register', file('expectation.json', expected)], configuration);
    const result = await runCli(['verify', file('submission.json', input)], configuration);
    expect(result).toMatchObject({
      verificationStatus: 'UNABLE_TO_VERIFY',
      settlementStatus: 'UNCONFIRMED',
    });
    expect(retrieveTelebirr).not.toHaveBeenCalled();
    const db = new Database(configuration.RECEIPT_DATABASE_FILE!);
    try {
      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM receipt_verifier_records WHERE record_key LIKE 'rv1:claim:%'",
          )
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
  it('retains accepted work through graceful worker abort and a new runtime', async () => {
    await runCli(['register', file('expectation.json', expected)], configuration);
    const accepted = (await runCli(['enqueue', file('submission.json', input)], configuration)) as {
      jobId: string;
    };
    const runtime = await openOperatorRuntime(configuration, true),
      controller = new AbortController(),
      outcomes: string[] = [];
    try {
      await runWorker(runtime.jobs!, {
        signal: controller.signal,
        once: false,
        pollMs: 1,
        emit: (outcome) => {
          outcomes.push(outcome);
          controller.abort();
        },
      });
    } finally {
      runtime.close();
    }
    expect(outcomes).toEqual(['RETRY_WAIT']);
    const restarted = await openOperatorRuntime(configuration, true);
    try {
      expect(await restarted.jobs!.status(input, accepted.jobId)).toMatchObject({
        state: 'RETRY_WAIT',
        attempts: 1,
        settlementStatus: 'UNCONFIRMED',
      });
    } finally {
      restarted.close();
    }
    expect(retrieveTelebirr).not.toHaveBeenCalled();
  });
  it('hands committed acceptance between actual Varlock CLI/worker processes with safe output', async () => {
    const env = {
      ...process.env,
      RECEIPT_DATABASE_FILE: configuration.RECEIPT_DATABASE_FILE!,
      RECEIPT_JOB_KEY: syntheticKey,
      RECEIPT_TIMEOUT_MS: '1000',
      RECEIPT_ALLOW_PROVIDER_TRAFFIC: 'false',
      RECEIPT_ENABLE_CBE: 'false',
    };
    const command = async (app: string, args: string[]) =>
      execute('pnpm', ['--filter', `@1hubengineering/receipt-verifier-${app}`, 'start', ...args], {
        cwd: root,
        env,
        timeout: 20000,
        maxBuffer: 100000,
      });
    await command('cli', ['register', file('expectation.json', expected)]);
    const acceptance = await command('cli', ['enqueue', file('submission.json', input)]);
    const accepted = JSON.parse(
      acceptance.stdout.split('\n').find((line) => line.startsWith('{'))!,
    ) as { jobId: string };
    expect(acceptance.stdout).not.toContain('TEST1234AB');
    expect(acceptance.stdout).not.toContain(syntheticKey);
    const worked = await command('worker', ['--once']);
    expect(worked.stdout).toContain('RETRY_WAIT');
    const status = await command('cli', [
      'status',
      file('status.json', {
        tenantId: input.tenantId,
        paymentId: input.paymentId,
        jobId: accepted.jobId,
      }),
    ]);
    expect(
      JSON.parse(status.stdout.split('\n').find((line) => line.startsWith('{'))!),
    ).toMatchObject({ state: 'RETRY_WAIT', attempts: 1, settlementStatus: 'UNCONFIRMED' });
    const wrong = await command('cli', [
      'status',
      file('wrong.json', { tenantId: 'wrong', paymentId: input.paymentId, jobId: accepted.jobId }),
    ]).catch((error) => error as { stderr: string });
    expect(wrong.stderr).toContain('NOT_FOUND');
    expect(wrong.stderr).not.toContain(syntheticKey);
    expect(wrong.stderr).not.toContain('TEST1234AB');
  }, 30000);
  it('exits cleanly on an actual SIGTERM while its worker loop is idle', async () => {
    const child = spawn(process.execPath, ['--import', 'varlock/auto-load', 'src/main.ts'], {
      cwd: join(root, 'apps/worker'),
      env: {
        ...process.env,
        RECEIPT_DATABASE_FILE: configuration.RECEIPT_DATABASE_FILE!,
        RECEIPT_JOB_KEY: syntheticKey,
        RECEIPT_TIMEOUT_MS: '1000',
        RECEIPT_ALLOW_PROVIDER_TRAFFIC: 'false',
        RECEIPT_ENABLE_CBE: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes('"worker":"IDLE"')) resolve();
        });
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Worker exited before its idle checkpoint')));
      });
      child.kill('SIGTERM');
      expect(await exited).toEqual([0, null]);
      expect(output).not.toContain(syntheticKey);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    }
  }, 20000);
});
