export function waitForDemo(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 450);
    function onAbort(): void {
      globalThis.clearTimeout(timer);
      reject(new Error('Demo request cancelled'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener('abort', onAbort);
      onAbort();
    }
  });
}
