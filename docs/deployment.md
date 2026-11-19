# Deploy the Payment Verifier

Run live receipt verification on a Node.js backend. Start with direct
connections from that backend. Add a Telebirr-only tunnel or move the verifier
to a worker if the backend cannot reach the provider. The server's connection
can differ from the user's phone or browser connection.

## Quick start

1. Use Node `^24.22.3` or `^26.13.1` and follow the [SDK quickstart](0.3.0/quickstart.md).
   Use one shared [claim store](0.3.0/storage.md) for processes that handle the
   same payments. Follow the storage guide when upgrading an existing store.
2. Register `retrieveTelebirr` from `@1hubengineering/verifier/providers` for
   direct Telebirr. For CBE, install `@1hubengineering/provider-cbe` and its
   matching Playwright peer, then install Chromium and OS libraries. Run as the
   service user with the [Chromium sandbox enabled](../packages/provider-cbe/README.md).
3. Run the checks below in the environment that will actually verify receipts.
   Test the application and store with synthetic evidence, then perform a
   controlled, authorized live smoke test before accepting payments.

Telebirr needs outbound HTTPS to `transactioninfo.ethiotelecom.et`. The current
CBE adapter needs `mbreciept.cbe.com.et` and `mb.cbe.com.et`. Direct connections
require public IPv4 DNS answers and verified TLS. Node retrieves the CBE page
and sandboxed Chromium makes the official data request for the current receipt
layout. A foreign server can use direct retrieval if its outbound connection
reaches the provider. A region, static IP, or cloud NAT offers no assurance of
Telebirr access.

## Check the actual deployment

From a source checkout, prepare the workspace and run the command as the
deployment user. For Docker, run the check inside the verifier container with
its DNS, egress and sandbox policy. Use the exported functions below if the
runtime image contains only the SDK packages.

```sh
vp env install
pnpm install --frozen-lockfile
pnpm build
pnpm check:deployment --provider telebirr --network
pnpm check:deployment --provider cbe --network
```

Run without `--network` for an offline check. CBE launches the same sandbox as
the adapter and renders synthetic HTML. If Chromium is missing, run
`pnpm setup:browsers` and install its OS libraries as needed. With `--network`,
the command performs bounded TLS handshakes with the official hosts and sends
no HTTP requests. It needs no receipt or database. JSON includes the checks,
next steps and `readyForSmokeTest`. Exit code `1` means a check failed, and `2`
means the inputs were invalid.

For a managed Node function without a shell, invoke the checks from a
temporary operator-only function in the same region and network. SDK 0.3.0 exports `checkProviderConnectivity` from `@1hubengineering/verifier/providers`
and `checkCbeBrowser` from `@1hubengineering/provider-cbe` for that purpose.

```js
import { checkProviderConnectivity } from '@1hubengineering/verifier/providers';

console.log(await checkProviderConnectivity('telebirr'));
```

A TLS pass confirms connectivity and certificate validation at that moment.
Verify an authorized receipt against a separately trusted order before relying
on that deployment. Provider availability or incomplete evidence can still
prevent a match.

## Hosting options

| Runtime                                                           | Where to run verification                                                                                                                                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local Node, VPS or VM                                             | Start with direct Telebirr and sandboxed CBE. Add the Telebirr-only socket if needed.                                                                                                                                | CBE retrieval tested on a workstation and VPS. Telebirr worked through the workstation tunnel after direct VPS timeouts. [Validation report](development/reports/v0.2.0-vps-validation.md)                                                                                                                                                                                                                                                 |
| Netlify Node Functions                                            | Test direct Telebirr with the deployed Node version, egress, and deadline. Use a separate Node worker for CBE or Telebirr that needs the tunnel. Background Functions have a separate execution budget.              | Managed SDK deployment untested. [Functions](https://docs.netlify.com/build/functions/overview/)                                                                                                                                                                                                                                                                                                                                           |
| Vercel Node.js Functions                                          | Test direct Telebirr with the deployed Node version, region, egress, and `maxDuration`. Use a separate Node worker for CBE or tunnel-dependent Telebirr.                                                             | Managed SDK deployment untested. [Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [duration](https://vercel.com/docs/functions/configuring-functions/duration)                                                                                                                                                                                                                                                          |
| Netlify Edge, Vercel Edge, Cloudflare Workers and Pages Functions | Use an authenticated Node verification backend. The current adapters rely on Node networking and CBE launches its own Chromium. Cloudflare Browser Run would require a separate adapter and validation.              | Native adapter execution is outside the supported contract. [Netlify Edge](https://docs.netlify.com/build/edge-functions/overview/), [Vercel Edge](https://vercel.com/docs/functions/runtimes/edge), [Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Pages Functions](https://developers.cloudflare.com/pages/functions/), [Browser Run](https://developers.cloudflare.com/browser-run/) |
| AWS EC2 or ECS on EC2                                             | Use the VM or container approach. Prove CBE sandbox startup in the deployed container. Add the Telebirr socket on a controlled VM if needed.                                                                         | VPS pattern tested. AWS deployment untested. [ECS egress](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-outbound.html)                                                                                                                                                                                                                                                                                            |
| AWS ECS on Fargate                                                | Consider direct Telebirr after checking egress. Run CBE only once the task can launch the sandbox. Use a separate host if the task cannot support the sandbox or socket.                                             | Fargate SDK deployment and sandbox untested. [Fargate security](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-security-considerations.html)                                                                                                                                                                                                                                                                          |
| AWS Lambda                                                        | Test direct Telebirr with a supported Node runtime, sufficient timeout, and public egress. A VPC-connected function needs an outbound internet route. Use a separate Node host for CBE or tunnel-dependent Telebirr. | Lambda SDK deployment untested. [Runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html), [timeouts](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html), [VPC egress](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)                                                                                                                                             |
| Static hosting                                                    | Host the UI and synthetic demo here. Submit live receipt evidence to the authenticated backend.                                                                                                                      | Synthetic GitHub Pages deployment tested. [Validation report](development/reports/v0.2.0-vps-validation.md)                                                                                                                                                                                                                                                                                                                                |

Cloudflare Containers can run a Linux Node image behind a Worker. Treat it as
an untested container target. Check the container's own egress, prove sandbox
startup before enabling CBE, and use a controlled worker if Telebirr needs the
workstation tunnel. [Cloudflare Containers](https://developers.cloudflare.com/containers/)

For a separate verifier, call a Node backend you operate or enqueue a
[durable job](development/durable-jobs.md). Authenticate the caller, load the
trusted order on the server, and submit the scoped payment ID, receipt locator,
and idempotency key. Use the same claim store on both sides. If the request
deadline is short, return a job ID and poll with authorization. The private
[workspace worker](../apps/worker/README.md) demonstrates SQLite on one host.
For separate machines, implement the job loop against a shared PostgreSQL or
MySQL adapter.

## Optional Telebirr-only SSH route

Use a machine that can reach Telebirr and an SSH account authorized to forward
to a private Unix socket. Use an always-on connection for ongoing service.
The workstation approach was tested from WSL to a Linux VPS.

1. Create a private directory on the verifier host for the socket. Give the
   SSH user and the verifier process access, preferably by using the same
   service account. In a container, mount only the socket directory and check
   the runtime UID or group permissions.
2. From the machine that reaches Telebirr, start the forward. Replace the
   socket path and SSH destination for your deployment.

   ```sh
   ssh -NT -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
     -R /home/verifier/telebirr/receipt.sock:transactioninfo.ethiotelecom.et:443 \
     verifier@verification-host
   ```

3. On the verifier, run the diagnostic with `--provider telebirr --network
   --telebirr-socket /home/verifier/telebirr/receipt.sock`. Use the path visible
   to the verifier. If the tunnel is offline, reconnect and check the mount.
   If a stale socket blocks reconnection, check `ss -xl` and remove the old
   socket only after confirming it has no listener.
4. Configure the socket in the backend. Omit the setting to restore direct
   retrieval. The adapter still verifies the official TLS hostname and keeps
   the same lookup deadline, receipt validation, and claim rules.

   ```ts
   import { retrieveTelebirr } from '@1hubengineering/verifier/providers';
   import type { ReceiptProvider } from '@1hubengineering/verifier';

   const socket = process.env.TELEBIRR_TUNNEL_SOCKET;
   const telebirr: ReceiptProvider = {
     retrieve: (input, bounds) =>
       retrieveTelebirr(input, {
         ...bounds,
         ...(socket ? { telebirrTunnelSocket: socket } : {}),
       }),
   };
   // Pass { telebirr } as the providers option to createReceiptVerifier.
   ```

The backend owns the environment variable and routing choice. The SDK takes
the explicit socket option. See the [SSH manual](https://man.openbsd.org/ssh.1)
and the [admin portal override](../apps/verification-playground/README.md#telebirr-over-ethio-telecom).
