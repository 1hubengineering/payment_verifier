import { expect, it, vi } from 'vite-plus/test';
import { checkProviderConnectivity, RetrievalError } from '@1hubengineering/verifier/providers';
import { checkCbeBrowser } from '@1hubengineering/provider-cbe';
import { runDeploymentCheck } from './deployment-check.ts';

vi.mock('@1hubengineering/verifier/providers', async (original) => ({
  ...(await original<typeof import('@1hubengineering/verifier/providers')>()),
  checkProviderConnectivity: vi.fn(),
}));
vi.mock('@1hubengineering/provider-cbe', () => ({ checkCbeBrowser: vi.fn() }));

it('checks the browser without opening a provider connection by default', async () => {
  vi.mocked(checkCbeBrowser).mockResolvedValueOnce(undefined);
  expect(await runDeploymentCheck(['--provider', 'cbe'])).toMatchObject({
    failed: false,
    readyForSmokeTest: false,
    browser: { status: 'passed' },
    connection: { status: 'skipped' },
  });
  expect(checkCbeBrowser).toHaveBeenCalledTimes(1);
  expect(checkProviderConnectivity).not.toHaveBeenCalled();
});

it('reports a browser startup error and rejects a Telebirr socket for CBE', async () => {
  vi.mocked(checkCbeBrowser).mockRejectedValueOnce(
    new RetrievalError('RECEIPT_BROWSER_UNAVAILABLE'),
  );
  expect(await runDeploymentCheck(['--provider', 'cbe'])).toMatchObject({
    failed: true,
    browser: { status: 'failed', code: 'RECEIPT_BROWSER_UNAVAILABLE' },
  });
  await expect(
    runDeploymentCheck([
      '--provider',
      'cbe',
      '--network',
      '--telebirr-socket',
      '/tmp/receipt.sock',
    ]),
  ).rejects.toThrow(TypeError);
});

it('reports a stopped tunnel and suggests how to reconnect', async () => {
  const path = '/run/demo/receipt.sock';
  vi.mocked(checkProviderConnectivity).mockResolvedValueOnce([
    {
      hostname: 'transactioninfo.ethiotelecom.et',
      route: 'telebirr-tunnel',
      error: {
        code: 'PROVIDER_NETWORK_ERROR',
        details: { transportCode: 'TELEBIRR_TUNNEL_OFFLINE' },
      },
    },
  ]);
  expect(
    await runDeploymentCheck(['--provider', 'telebirr', '--network', '--telebirr-socket', path]),
  ).toMatchObject({
    failed: true,
    readyForSmokeTest: false,
    connection: [{ status: 'failed', next: expect.stringContaining('reconnect') }],
  });
  expect(checkProviderConnectivity).toHaveBeenCalledWith('telebirr', {
    telebirrTunnelSocket: path,
  });
});
