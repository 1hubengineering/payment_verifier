import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { expect, it } from 'vite-plus/test';
it('runs the loopback Varlock demo without providers and closes its owned database on SIGTERM', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'receipt-checkout-')),
    filename = join(directory, 'synthetic.sqlite');
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('Missing local test port');
  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'varlock/auto-load', 'src/main.ts'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CHECKOUT_DATABASE_FILE: filename, CHECKOUT_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit'),
    timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  let output = '';
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes('SYNTHETIC_NO_PROVIDERS')) resolve();
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Demo exited before listening')));
    });
    const headers = { authorization: 'Bearer synthetic-customer-a' };
    const order = await fetch(`http://127.0.0.1:${port}/orders/synthetic-order`, { headers });
    expect(await order.json()).toMatchObject({
      settlementStatus: 'UNCONFIRMED',
      fulfillmentStatus: 'PENDING',
    });
    const response = await fetch(
      `http://127.0.0.1:${port}/orders/synthetic-order/receipt-verifications`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'idempotency-key': 'synthetic-test',
        },
        body: JSON.stringify({ receiptLocator: 'SYNTH1234' }),
      },
    );
    expect(await response.json()).toMatchObject({
      receipt: { verificationStatus: 'UNABLE_TO_VERIFY', settlementStatus: 'UNCONFIRMED' },
    });
    child.kill('SIGTERM');
    expect(await exited).toEqual([0, null]);
    const db = new Database(filename);
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
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}, 20000);
