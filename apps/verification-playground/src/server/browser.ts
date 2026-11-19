import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';

async function cgroupMemory() {
  const text = await readFile('/sys/fs/cgroup/memory.current', 'utf8').catch(() => undefined);
  return text ? Number(text.trim()) : null;
}

/** Check the installed Chromium namespace sandbox with a local, synthetic document. */
export async function checkBrowserSandbox() {
  const memoryBaselineBytes = await cgroupMemory();
  const start = performance.now();
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    env: { LANG: 'C.UTF-8', TZ: 'UTC' },
    args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND'],
    timeout: 15_000,
  });
  const started = performance.now();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.setContent('<main>Sandboxed Chromium probe</main>', { timeout: 5000 });
    if ((await page.locator('main').textContent({ timeout: 5000 })) !== 'Sandboxed Chromium probe')
      throw new Error('Chromium sandbox probe could not render the synthetic document');
    return {
      version: browser.version(),
      startupMs: started - start,
      renderingMs: performance.now() - started,
      memoryBaselineBytes,
      memoryWithBrowserBytes: await cgroupMemory(),
    };
  } finally {
    await browser.close();
  }
}
