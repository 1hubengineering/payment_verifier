import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { sqliteStorage } from '@1hubengineering/storage-sql/sqlite';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Report, HistoryItem, Submission } from '../contracts.ts';
import { defaultDraft, syntheticIdentifier } from '../presets.ts';
import { setAdministrator } from './auth.ts';
import { createApp } from './app.ts';
import { syntheticProvider } from '@1hubengineering/verification-benchmarks/synthetic';

const username = 'fixture-admin';
const initial = 'example-initial-password';
const password = 'example-replaced-password';
const origin = 'http://127.0.0.1:4080';
let headers: { cookie: string; origin: string };
function cookie(response: { headers: Record<string, string | string[] | number | undefined> }) {
  return String(response.headers['set-cookie']).split(';')[0]!;
}
const epoch = 1_800_000_000_000;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture(
  options: {
    unseeded?: boolean;
    benchmarks?: boolean;
    live?: Parameters<typeof createApp>[0]['liveProviders'];
    now?: () => number;
    wrapLive?: (
      storage: ReturnType<typeof sqliteStorage>,
    ) => Parameters<typeof createApp>[0]['stores']['live'];
  } = {},
) {
  const stateDb = new Database(':memory:');
  const simulatedDb = new Database(':memory:');
  const liveDb = new Database(':memory:');
  const simulated = sqliteStorage(simulatedDb);
  const live = sqliteStorage(liveDb);
  await simulated.migrate();
  await live.migrate();
  const scratch = options.benchmarks ? mkdtempSync(join(tmpdir(), 'andhub-test-')) : undefined;
  const app = await createApp({
    ...(scratch
      ? {
          benchmarks: {
            scratch,
            source: 'test',
            docker: 'test',
            storage: 'test',
            chromium: 'disabled',
          },
        }
      : {}),
    origin,
    timeoutMs: 20,
    retentionDays: 1,
    stateDb,
    stores: { simulated, live: options.wrapLive?.(live) ?? live },
    liveProviders: options.live ?? {},
    now: options.now ?? (() => epoch),
  });
  cleanups.push(async () => {
    await app.close();
    stateDb.close();
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    simulatedDb.close();
    liveDb.close();
  });
  if (!options.unseeded) {
    await setAdministrator(stateDb, 'seed', username, initial);
    const login = await app.inject({
      url: '/api/auth/login',
      method: 'POST',
      headers: { origin },
      payload: { username, password: initial },
    });
    expect(login.statusCode).toBe(200);
    const change = await app.inject({
      url: '/api/auth/password',
      method: 'POST',
      headers: { origin, cookie: cookie(login) },
      payload: { current: initial, password },
    });
    expect(change.statusCode).toBe(200);
    headers = { origin, cookie: cookie(change) };
  }
  async function register(
    provider: 'cbe' | 'telebirr' = 'telebirr',
    mode: Submission['mode'] = 'simulated',
    overrides = {},
  ) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios',
      headers,
      payload: { mode, draft: { ...defaultDraft(provider, epoch), ...overrides } },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ paymentId: string }>().paymentId;
  }
  function submit(paymentId: string, overrides: Partial<Submission> = {}) {
    const input: Submission = {
      paymentId,
      attemptId: randomUUID(),
      evidence: syntheticIdentifier('telebirr', randomUUID()),
      inputProvider: 'auto',
      mockCase: 'success',
      mode: 'simulated',
      ...overrides,
    };
    return app.inject({ method: 'POST', url: '/api/verify', headers, payload: input });
  }
  return { app, stateDb, register, submit };
}

describe('verification playground with SDK 0.3.0 and real SQLite adapters', () => {
  it('protects operational routes, enforces origin and size, and keeps mock mode as default', async () => {
    const { app } = await fixture();
    for (const url of ['/api/session', '/api/history', '/api/drafts']) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(
      (await app.inject({ method: 'POST', url: '/api/verify', headers: { origin }, payload: {} }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/session',
          headers: { ...headers, origin: 'https://other.invalid' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/verify',
          headers,
          payload: { evidence: 'x'.repeat(40_000) },
        })
      ).statusCode,
    ).toBe(413);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/scenarios',
          headers,
          payload: { mode: 'live', draft: defaultDraft('cbe', epoch) },
        })
      ).json(),
    ).toMatchObject({ code: 'LIVE_DISABLED' });
  });

  it.each([
    ['telebirr', 'SYNTHR1234', 'identifier'],
    ['telebirr', 'https://transactioninfo.ethiotelecom.et/receipt/SYNTHR1234', 'receipt_url'],
    [
      'telebirr',
      'Paid ETB 100.55. Receipt https://transactioninfo.ethiotelecom.et/receipt/SYNTHR1234. Balance ETB 50.',
      'sms',
    ],
    ['cbe', 'v2-Synthetic_42', 'identifier'],
    ['cbe', 'https://mbreciept.cbe.com.et/v2-Synthetic_42', 'receipt_url'],
    ['cbe', 'CBE Receipt ID: v2-Synthetic_42. Balance ETB 50.', 'sms'],
  ] as const)(
    'verifies %s evidence of each supported format',
    async (provider, evidence, inputType) => {
      const { register, submit } = await fixture();
      const response = await submit(await register(provider), { evidence });
      expect(response.statusCode).toBe(200);
      expect(response.json<Report>()).toMatchObject({
        mode: 'simulated',
        result: { status: 'VERIFIED', input: { provider, inputType } },
        timing: {
          phases: {
            inputPreview: { calls: 1 },
            prepare: { calls: 1 },
            provider: { calls: 1 },
            complete: { calls: 1 },
          },
        },
      });
    },
  );

  it.each([
    ['amount', 'MISMATCH', 'AMOUNT_UNDERPAID'],
    ['invoice', 'MISMATCH', 'INVOICE_REFERENCE_MISMATCH'],
    ['recipient', 'MISMATCH', 'RECIPIENT_NAME_MISMATCH'],
    ['missing', 'NOT_FOUND', 'RECEIPT_NOT_FOUND'],
    ['timeout', 'UNAVAILABLE', 'PROVIDER_TIMEOUT'],
    ['network', 'UNAVAILABLE', 'PROVIDER_NETWORK_ERROR'],
  ] as const)('preserves the SDK outcome for %s', async (mockCase, status, code) => {
    const { register, submit } = await fixture();
    const response = await submit(await register(), { mockCase });
    expect(response.json<Report>().result).toMatchObject({ status, code });
  });

  it('uses SDK validation and amount ranges while saved draft edits leave expectations immutable', async () => {
    const { app, register, submit } = await fixture();
    const draft = {
      ...defaultDraft('telebirr', epoch),
      tolerance: true,
      over: { unit: 'percentage', value: '1' },
    };
    const amountPreview = await app.inject({
      method: 'POST',
      url: '/api/amount-preview',
      headers,
      payload: draft,
    });
    expect(amountPreview.json()).toEqual({
      minimumAcceptedMinor: 9995,
      maximumAcceptedMinor: 10155,
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/scenarios',
      headers,
      payload: { mode: 'simulated', draft: { ...draft, amount: '1.001' } },
    });
    expect(invalid.json()).toMatchObject({ code: 'INVALID_EXPECTATION' });
    const saved = (
      await app.inject({
        method: 'POST',
        url: '/api/drafts',
        headers,
        payload: { name: 'Original', draft },
      })
    ).json<{ id: string }>();
    const paymentId = await register('telebirr', 'simulated', draft);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/drafts/${saved.id}`,
          headers,
          payload: { name: 'Edited', draft: { ...draft, reference: 'UPDATED' } },
        })
      ).statusCode,
    ).toBe(200);
    expect((await submit(paymentId, { mockCase: 'amount' })).json<Report>().result).toMatchObject({
      status: 'VERIFIED',
    });
  });

  it.each(['telebirr', 'cbe'] as const)(
    'registers, claims and replays %s only when the configured note matches',
    async (provider) => {
      const synthetic = syntheticProvider(provider, () => 'success', { now: () => epoch });
      let reference = 'ክፍያ  / café #42';
      const retrieve = vi.fn(async (input: string) => {
        const outcome = await synthetic.retrieve(input);
        return outcome.kind === 'EVIDENCE'
          ? { ...outcome, evidence: { ...outcome.evidence, reference } }
          : outcome;
      });
      const { app, register, submit } = await fixture({ live: { [provider]: { retrieve } } });
      const rejected = await app.inject({
        method: 'POST',
        url: '/api/scenarios',
        headers,
        payload: { mode: 'live', draft: { ...defaultDraft(provider, epoch), reference: '' } },
      });
      expect(rejected.json()).toMatchObject({ code: 'INVALID_EXPECTATION' });
      const blank = await register(provider, 'live', { reference: '', referenceRequired: false });
      const paymentId = await register(provider, 'live', { reference });
      expect(retrieve).not.toHaveBeenCalled();

      const request = {
        mode: 'live',
        evidence: syntheticIdentifier(provider, randomUUID()),
      } as const;
      expect((await submit(blank, request)).json<Report>().result.code).toBe(
        'INVOICE_REFERENCE_MISMATCH',
      );
      expect((await submit(paymentId, request)).json<Report>().result).toMatchObject({
        status: 'VERIFIED',
      });

      reference = '';
      const blankRequest = {
        mode: 'live',
        evidence: syntheticIdentifier(provider, randomUUID()),
        attemptId: randomUUID(),
      } as const;
      const result = (await submit(blank, blankRequest)).json<Report>().result;
      expect(result).toMatchObject({ status: 'VERIFIED', receipt: { invoiceReference: null } });
      expect((await submit(blank, blankRequest)).json<Report>().result).toEqual(result);
      expect(retrieve).toHaveBeenCalledTimes(3);
    },
  );

  it('respects the expected provider and preserves input errors before any provider call', async () => {
    const { register, submit } = await fixture();
    const paymentId = await register();
    const mismatch = (
      await submit(paymentId, { evidence: 'v2-Synthetic_42', inputProvider: 'cbe' })
    ).json<Report>();
    expect(mismatch.result).toMatchObject({ status: 'INVALID_INPUT', code: 'PROVIDER_MISMATCH' });
    expect(mismatch.timing.phases.provider).toBeUndefined();
    for (const [evidence, code] of [
      ['v2-', 'INVALID_IDENTIFIER'],
      ['ID v2-Conflict and https://mbreciept.cbe.com.et/v2-Synthetic_42', 'AMBIGUOUS_INPUT'],
    ] as const) {
      expect((await submit(paymentId, { evidence })).json<Report>().result).toMatchObject({
        status: 'INVALID_INPUT',
        code,
      });
    }
    expect((await submit(paymentId, { inputProvider: 'cbe' })).json()).toMatchObject({
      code: 'INPUT_PROVIDER_CONFLICT',
    });
  });

  it('handles concurrent attempts without claiming a receipt twice and safely replays the winner', async () => {
    const { register, submit } = await fixture();
    const [one, two] = await Promise.all([register(), register()]);
    const evidence = 'SYNTHR1234';
    const attemptId = randomUUID();
    const outcomes = (
      await Promise.all([submit(one, { evidence, attemptId }), submit(two, { evidence })])
    ).map((response) => response.json<Report>());
    expect(outcomes.map((item) => item.result.code).sort()).toEqual([
      'PAYMENT_VERIFIED',
      'RECEIPT_ALREADY_CLAIMED',
    ]);
    expect((await submit(one, { evidence, attemptId })).json()).toEqual(outcomes[0]);
    expect((await submit(one, { evidence: 'CHANGED123', attemptId })).json()).toMatchObject({
      code: 'ATTEMPT_CONFLICT',
    });
  });

  it('recovers a committed SDK result after an uncertain storage response without a second retrieval', async () => {
    let failCommitResponse = false;
    const adapter = syntheticProvider('telebirr', () => 'success', { now: () => epoch });
    const retrieve = vi.fn((...args: Parameters<typeof adapter.retrieve>) =>
      adapter.retrieve(...args),
    );
    const { register, submit, app } = await fixture({
      live: { telebirr: { retrieve } },
      wrapLive: (storage) => ({
        ...storage,
        async transaction(work) {
          const value = await storage.transaction(work);
          if (failCommitResponse) {
            failCommitResponse = false;
            throw new Error('Synthetic lost response');
          }
          return value;
        },
      }),
    });
    const paymentId = await register('telebirr', 'live');
    const attemptId = randomUUID();
    const request = { mode: 'live', attemptId, evidence: 'SYNTHR1234' } as const;
    failCommitResponse = true;
    const uncertain = await submit(paymentId, request);
    expect(uncertain.statusCode).toBe(503);
    expect(uncertain.json<Report>().result.code).toBe('STORAGE_OUTCOME_UNKNOWN');
    const pending = await app.inject({ url: `/api/history/${attemptId}`, headers });
    expect(pending.json<HistoryItem>().report).toBeNull();
    const recovered = (await submit(paymentId, request)).json<Report>();
    expect(recovered.result.code).toBe('PAYMENT_VERIFIED');
    expect(recovered.timing.phases.provider).toBeUndefined();
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('reveals authorized comparison values only in an opted-in response and keeps identifier redaction', async () => {
    const { app, register, submit } = await fixture({
      live: { telebirr: syntheticProvider('telebirr', () => 'invoice', { now: () => epoch }) },
    });
    const paymentId = await register('telebirr', 'live');
    const attemptId = randomUUID();
    const request = {
      evidence: 'SYNTHR1234',
      mode: 'live',
      attemptId,
      showLiveValues: true,
    } as const;
    const response = await submit(paymentId, request);
    const report = response.json<Report>();
    expect(report.transientChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'invoiceReference',
          expected: 'INV-SYNTH-1024',
          actual: 'OTHER-INVOICE',
        }),
      ]),
    );
    expect(JSON.stringify(report.result)).not.toContain('OTHER-INVOICE');
    expect(response.body).not.toContain('SYNTHR1234');
    const history = await app.inject({ url: `/api/history/${attemptId}`, headers });
    expect(history.body).not.toContain('OTHER-INVOICE');
    expect((await submit(paymentId, request)).json<Report>().transientChecks).toBeUndefined();
  });

  it('limits live concurrency without affecting simulated attempts', async () => {
    const adapter = syntheticProvider('telebirr', () => 'success', { now: () => epoch });
    let signalStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { register, submit } = await fixture({
      live: {
        telebirr: {
          async retrieve(...args) {
            signalStarted();
            await blocked;
            return adapter.retrieve(...args);
          },
        },
      },
    });
    const first = await register('telebirr', 'live');
    const second = await register('telebirr', 'live');
    const simulated = await register();
    const running = submit(first, { mode: 'live' });
    await started;
    try {
      expect((await submit(second, { mode: 'live' })).json()).toMatchObject({
        code: 'VERIFICATION_BUSY',
      });
      expect((await submit(simulated)).json<Report>().result.code).toBe('PAYMENT_VERIFIED');
    } finally {
      release();
      expect((await running).json<Report>().result.code).toBe('PAYMENT_VERIFIED');
    }
  });

  it('redacts live history, expires diagnostics and keeps SDK claims intact', async () => {
    let time = epoch;
    const adapter = syntheticProvider('telebirr', () => 'success', { now: () => time });
    const retrieve = vi.fn((...args: Parameters<typeof adapter.retrieve>) =>
      adapter.retrieve(...args),
    );
    const { app, stateDb, register, submit } = await fixture({
      now: () => time,
      live: { telebirr: { retrieve } },
    });
    const evidence =
      'Receipt https://transactioninfo.ethiotelecom.et/receipt/SYNTHR1234. Private SMS balance.';
    const attemptId = randomUUID();
    const live = await register('telebirr', 'live', {
      validUntil: new Date(epoch + 5 * 86_400_000).toISOString(),
    });
    const report = await submit(live, { evidence, mode: 'live', attemptId });
    expect(report.json<Report>().result).toMatchObject({
      status: 'VERIFIED',
      receipt: { recipientAccount: { representation: 'LAST4', value: '1123' } },
    });
    expect(report.body).not.toContain('SYNTHR1234');
    expect(report.body).not.toContain('Example Merchant');
    expect(
      JSON.stringify(stateDb.prepare('SELECT * FROM playground_attempts').all()),
    ).not.toContain('Private SMS balance');
    expect((await submit(await register(), { evidence })).json<Report>().result.code).toBe(
      'PAYMENT_VERIFIED',
    );
    time += 2 * 86_400_000;
    const renewed = await app.inject({
      url: '/api/auth/login',
      method: 'POST',
      headers: { origin },
      payload: { username, password },
    });
    headers = { origin, cookie: cookie(renewed) };
    expect((await app.inject({ url: `/api/history/${attemptId}`, headers })).statusCode).toBe(404);
    const next = await register('telebirr', 'live', {
      validUntil: new Date(epoch + 5 * 86_400_000).toISOString(),
    });
    expect((await submit(next, { evidence, mode: 'live' })).json<Report>().result.code).toBe(
      'RECEIPT_ALREADY_CLAIMED',
    );
  });
});

describe('administrator authentication and benchmark admission', () => {
  it('requires the initial change, enforces origin, and invalidates sessions on rotation and logout', async () => {
    let time = epoch;
    const { app, stateDb } = await fixture({ unseeded: true, now: () => time, benchmarks: true });
    await setAdministrator(stateDb, 'seed', username, initial);
    await expect(setAdministrator(stateDb, 'seed', username, password)).rejects.toThrow(
      'already exists',
    );
    const login = () =>
      app.inject({
        url: '/api/auth/login',
        method: 'POST',
        headers: { origin },
        payload: { username, password: initial },
      });
    const first = await login();
    expect(first.json()).toEqual({ mustChangePassword: true });
    expect(first.headers['set-cookie']).toMatch(/HttpOnly; SameSite=Strict/u);
    const pendingHeaders = { origin, cookie: cookie(first) };
    expect(
      (await app.inject({ url: '/api/benchmarks', headers: pendingHeaders })).json(),
    ).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    const payload = { current: initial, password };
    for (const rejected of [
      { cookie: pendingHeaders.cookie },
      { ...pendingHeaders, origin: 'https://other.invalid' },
    ]) {
      expect(
        (
          await app.inject({
            url: '/api/auth/password',
            method: 'POST',
            headers: rejected,
            payload,
          })
        ).statusCode,
      ).toBe(403);
    }
    const change = await app.inject({
      url: '/api/auth/password',
      method: 'POST',
      headers: pendingHeaders,
      payload,
    });
    expect(change.statusCode).toBe(200);
    expect((await login()).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/history', headers: pendingHeaders })).statusCode).toBe(
      401,
    );
    const active = { origin, cookie: cookie(change) };
    expect((await app.inject({ url: '/api/benchmarks', headers: active })).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/auth/logout', method: 'POST', headers: active })).statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/history', headers: active })).statusCode).toBe(401);
    await setAdministrator(stateDb, 'rotate', username, initial);
    const rotated = await login();
    expect(rotated.statusCode).toBe(200);
    time += 8 * 60 * 60_000;
    expect(
      (await app.inject({ url: '/api/session', headers: { origin, cookie: cookie(rotated) } }))
        .statusCode,
    ).toBe(401);
  });

  it('limits repeated credential failures and bounds, executes and cancels local benchmark jobs', async () => {
    const { app } = await fixture({ benchmarks: true });
    for (let index = 0; index < 6; index++) {
      const response = await app.inject({
        url: '/api/auth/login',
        method: 'POST',
        headers: { origin },
        payload: { username, password: 'wrong' },
      });
      expect(response.statusCode).toBe(401);
    }
    expect(
      (
        await app.inject({
          url: '/api/auth/login',
          method: 'POST',
          headers: { origin },
          payload: { username, password },
        })
      ).statusCode,
    ).toBe(429);
    const start = (requests: number) =>
      app.inject({
        url: '/api/benchmarks',
        method: 'POST',
        headers,
        payload: { workload: 'recovery', requests, concurrency: 1 },
      });
    expect((await start(602)).statusCode).toBe(400);
    const cancelled = (await start(600)).json<{ id: string }>();
    expect((await start(8)).statusCode).toBe(409);
    expect(
      (await app.inject({ url: `/api/benchmarks/${cancelled.id}/cancel`, method: 'POST', headers }))
        .statusCode,
    ).toBe(204);
    async function history() {
      return (await app.inject({ url: '/api/benchmarks', headers })).json<{ history: unknown[] }>()
        .history;
    }
    await vi.waitFor(async () =>
      expect((await history())[0]).toMatchObject({ id: cancelled.id, status: 'cancelled' }),
    );
    const started = await start(8);
    expect(started.statusCode).toBe(202);
    await vi.waitFor(
      async () =>
        expect((await history())[0]).toMatchObject({
          status: 'completed',
          report: { measurement: { source: 'synthetic-only', options: { requests: 8 } } },
        }),
      { timeout: 5000 },
    );
  });
});
