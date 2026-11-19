import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.PLAYGROUND_SMOKE_ORIGIN ?? 'http://127.0.0.1:4080';
const username = process.env.PLAYGROUND_SMOKE_USERNAME;
const initial = process.env.PLAYGROUND_SMOKE_INITIAL;
const replacement = process.env.PLAYGROUND_SMOKE_REPLACEMENT;
assert.ok(username && initial && replacement && replacement !== initial);
assert.equal((await fetch(new URL('/health', origin))).status, 200);
assert.equal((await fetch(new URL('/api/history', origin))).status, 401);
assert.equal((await fetch(new URL('/api/benchmarks', origin))).status, 401);

const certPin = process.env.PLAYGROUND_SMOKE_BROWSER_CERT_PIN;
const browser = await chromium.launch({
  chromiumSandbox: true,
  ...(certPin ? { args: [`--ignore-certificate-errors-spki-list=${certPin}`] } : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  const resourceErrors = [];
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && !response.ok())
      resourceErrors.push(response.status());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Administrator name').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(initial);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Change administrator password' }).waitFor();
  assert.equal((await page.request.get(new URL('/api/history', origin).href)).status(), 403);
  await page.getByLabel('Current password').fill(initial);
  await page.getByLabel('New password', { exact: true }).fill(replacement);
  await page.getByLabel('Confirm new password').fill(replacement);
  await page.getByRole('button', { name: 'Save password' }).click();
  await page.getByRole('heading', { name: 'Expected payment' }).waitFor();
  if (origin.startsWith('https:')) {
    const cookies = await context.cookies();
    assert.ok(
      cookies.some(
        ({ name, httpOnly, secure, sameSite }) =>
          name === '__Host-andhub-session' && httpOnly && secure && sameSite === 'Strict',
      ),
    );
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Expected payment' }).waitFor();
  await page.getByLabel('Amount policy').selectOption('tolerance');
  await page.getByRole('button', { name: 'Preview range' }).click();
  await page.getByText('99.95 ETB to 101.05 ETB').waitFor();
  await page.getByLabel('Mock outcome').selectOption('amount');
  await page.getByRole('button', { name: 'Use synthetic ID' }).click();
  await page.getByText('Input parsed', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Verify payment' }).click();
  const report = page.getByRole('dialog');
  await report.getByRole('heading', { name: 'Simulated verification' }).waitFor();
  await report.getByText('Accepted range ETB 99.95 to ETB 101.05').waitFor();
  await report.getByText('Performance diagnostics').click();
  await report.getByRole('row', { name: /Provider adapter/ }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.textContent === 'Verify payment');
  await page.getByRole('button', { name: /View result/ }).click();
  await report.getByRole('heading', { name: 'Simulated verification' }).waitFor();
  await report.getByRole('button', { name: 'Close' }).click();

  for (const [selection, title] of [
    ['recipient', 'Receipt details did not match'],
    ['timeout', 'Receipt could not be checked'],
  ]) {
    await page.getByRole('button', { name: 'Reset defaults' }).click();
    await page.getByLabel('Mock outcome').selectOption(selection);
    await page.getByRole('button', { name: 'Use synthetic ID' }).click();
    await page.getByRole('button', { name: 'Verify payment' }).click();
    await report.getByRole('heading', { name: title }).waitFor();
    if (selection === 'recipient') await report.getByText('1 failed', { exact: true }).waitFor();
    else await report.getByText('No individual checks were available for this attempt.').waitFor();
    await report.getByRole('button', { name: 'Close' }).click();
  }

  await page.getByRole('button', { name: 'Benchmarking' }).click();
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await page.getByText('Tail latency (p95)', { exact: true }).waitFor();
  await page.getByText('Run conditions, outcome counts and raw JSON').click();
  await page.getByText(/60 measured attempts across 60 scenarios/).waitFor();
  await page.getByLabel('Concurrent scenarios').fill('4');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  const comparison = page.getByRole('region', { name: 'Comparable benchmark runs' });
  await comparison.getByRole('row', { name: /Selected 4/ }).waitFor();
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Administrator name').waitFor();
  assert.equal((await page.request.get(new URL('/api/history', origin).href)).status(), 401);
  assert.deepEqual(errors, []);
  assert.deepEqual(resourceErrors, []);
  console.log(
    'Admin authentication, password change, protected routes, synthetic SDK verification, benchmarks, and responsive layout passed.',
  );
} finally {
  await browser.close();
}
