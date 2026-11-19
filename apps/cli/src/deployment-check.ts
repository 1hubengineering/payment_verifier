import { parseArgs } from 'node:util';
import { checkProviderConnectivity, RetrievalError } from '@1hubengineering/verifier/providers';

const instructions = `Usage: pnpm check:deployment --provider telebirr|cbe [--network] [--telebirr-socket /path/to/socket]
Network checks are optional. They stop at TLS and send no receipt or HTTP request.
`;

export async function runDeploymentCheck(args: readonly string[]) {
  const { values } = parseArgs({
    args: [...args],
    options: {
      help: { type: 'boolean' },
      provider: { type: 'string' },
      network: { type: 'boolean' },
      'telebirr-socket': { type: 'string' },
    },
  });
  if (values.help) return instructions;
  const provider = values.provider;
  const telebirrTunnelSocket = values['telebirr-socket'];
  if (
    (provider !== 'telebirr' && provider !== 'cbe') ||
    (telebirrTunnelSocket !== undefined && (provider !== 'telebirr' || !values.network))
  )
    throw new TypeError(instructions);

  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  const supportsNode =
    major === 24
      ? minor! > 22 || (minor === 22 && patch! >= 3)
      : major === 26 && (minor! > 13 || (minor === 13 && patch! >= 1));
  const browser = provider === 'cbe' ? await browserCheck() : undefined;
  const connection = values.network
    ? await checkProviderConnectivity(
        provider,
        telebirrTunnelSocket === undefined ? {} : { telebirrTunnelSocket },
      )
    : 'skipped';
  return {
    provider,
    readyForSmokeTest:
      supportsNode &&
      browser?.status !== 'failed' &&
      connection !== 'skipped' &&
      connection.every((check) => check.error === undefined),
    failed:
      !supportsNode ||
      browser?.status === 'failed' ||
      (connection !== 'skipped' && connection.some((check) => check.error !== undefined)),
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      supported: supportsNode,
      ...(!supportsNode && { next: 'Use Node ^24.22.3 or ^26.13.1 on the verification backend.' }),
    },
    browser,
    connection:
      connection === 'skipped'
        ? {
            status: 'skipped',
            next: 'Pass --network to test DNS and TLS from this runtime.',
          }
        : connection.map(({ hostname, route, error }) => ({
            hostname,
            route,
            status: error ? 'failed' : 'passed',
            ...(error && {
              error,
              next: connectionAdvice(route, error.code, error.details.transportCode),
            }),
          })),
  };
}

async function browserCheck() {
  try {
    const { checkCbeBrowser } = await import('@1hubengineering/provider-cbe');
    await checkCbeBrowser();
    return { status: 'passed' as const };
  } catch (error) {
    return {
      status: 'failed' as const,
      code: error instanceof RetrievalError ? error.code : 'CBE_BROWSER_CHECK_FAILED',
      next: 'Install the matching Playwright Chromium and system libraries. Verify the OS sandbox as the runtime user or run CBE on a separate supported host.',
    };
  }
}

function connectionAdvice(route: string, code: string, transportCode: unknown): string {
  if (transportCode === 'TELEBIRR_TUNNEL_OFFLINE')
    return 'Start or reconnect the Telebirr SSH tunnel and check that its socket is mounted.';
  if (transportCode === 'EACCES')
    return 'Check the runtime user’s permissions on the socket and its directory.';
  if (code === 'PROVIDER_DNS_ERROR' || code === 'DESTINATION_BLOCKED')
    return 'Check that DNS in this runtime resolves the provider to public IPv4 addresses.';
  if (code === 'PROVIDER_TLS_ERROR')
    return 'Check the system clock, trust store, and whether a proxy is intercepting provider TLS.';
  return route === 'telebirr-tunnel'
    ? 'Check that the tunnel client can reach Telebirr on its current connection.'
    : 'Check outbound TCP 443 from this runtime. Compare with a known-working connection before changing deployment routing.';
}
