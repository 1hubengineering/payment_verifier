# AndHub Payment Verifier admin portal

Private Fastify and React application for the SDK 0.2.0 source candidate. One
administrator can run **Live Verification** and **Benchmarking**. The SDK
packages and protocol own expectations, verification, claims and idempotency.
The portal uses separate live and simulated SDK stores. Neither a receipt match
nor a synthetic result confirms settlement.

## Local setup

Run from the workspace root. Live retrieval defaults to disabled.

```sh
vp env install
pnpm install --frozen-lockfile
pnpm build
pnpm playground:build
pnpm playground
```

In a second Bash terminal, create the single administrator. Generate a strong
initial password with your password manager and enter it at the hidden prompt.

```bash
read -r -s -p 'Initial administrator password: ' portal_password
printf '\n'
printf '%s\n' "$portal_password" | pnpm --filter @1hubengineering/verification-playground admin seed admin
unset portal_password
```

Open <http://127.0.0.1:4080> and sign in. Change the initial password on the first
login to unlock both tools. For a reset, repeat the command with `rotate`
instead of `seed`. Rotation revokes all active sessions and requires another
password change. A seed cannot overwrite an existing account. The administrator
name can be an email or a username. The command accepts the password on stdin,
hashes it using Argon2id, and stores the salted digest in SQLite.

For hot reload, start the API with
`PLAYGROUND_ORIGIN=http://127.0.0.1:4081 pnpm playground` and run
`pnpm --filter @1hubengineering/verification-playground dev` in a second terminal.
Open port 4081. The development proxy keeps both on one origin.

## Configuration

Varlock validates the app-local schema at process startup.

| Variable                                                                             | Default and purpose                                                                                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `PLAYGROUND_ORIGIN`                                                                  | Exact browser origin. The standalone default is `http://127.0.0.1:4080`.                           |
| `PLAYGROUND_HOST` / `PLAYGROUND_PORT`                                                | Standalone listener at `127.0.0.1:4080`. A container listener uses a private network behind HTTPS. |
| `PLAYGROUND_DATA_DIR`                                                                | `.playground-data` locally and `/data` in Docker. Persist the volume.                              |
| `PLAYGROUND_LIVE`                                                                    | `false`. Enable the official Telebirr adapter.                                                     |
| `PLAYGROUND_TELEBIRR_TUNNEL_SOCKET`                                                  | Unset for direct Telebirr HTTPS. The VPS override sets a private Unix socket path.                 |
| `PLAYGROUND_CBE`                                                                     | `false`. Requires live mode, pinned Chromium and its sandbox.                                      |
| `PLAYGROUND_LIVE_DATABASE_URL`                                                       | Unset for local SQLite. PostgreSQL and MySQL URLs select the existing direct SQL adapter.          |
| `PLAYGROUND_TIMEOUT_MS`                                                              | 15000. The default official provider budget in milliseconds.                                       |
| `PLAYGROUND_RETENTION_DAYS`                                                          | 7. Retention for app history and inactive scenario links.                                          |
| `PLAYGROUND_SOURCE_ID`, `PLAYGROUND_DEPLOYMENT_ENGINE`, `PLAYGROUND_STORAGE_DETAILS` | Benchmark provenance. Set these to the reviewed Git commit, Docker runtime and filesystem.         |

The portal sets an eight-hour, HttpOnly, SameSite=Strict session cookie and
adds Secure and the `__Host-` prefix over HTTPS. Mutations require the exact
origin. Operational endpoints enforce administrator authentication and the
initial-password change. Failed credential attempts are rate limited. Password
resets and logout invalidate server-side sessions.

## Live verification

Create an immutable expected payment from authorized test data. The SDK checks
ETB, exact or tolerated amount in minor units, provider, successful status,
recipient name and account last four, invoice reference, and UTC validity
window. Editing a saved draft leaves the registered expectation intact. Submit
an identifier, receipt URL or SMS. The backend validates input independently and
passes it to the SDK, which constructs an official provider locator.

Review the status, code, stage, retryability, checks and timing. A timeout is
`UNAVAILABLE` and may be retryable. A sandbox launch failure is
`RECEIPT_BROWSER_UNAVAILABLE` at `receipt_rendering`. History omits raw SMS, full
receipt HTML and full account numbers. **Reveal recipient and invoice values**
shows those values for one response and keeps them out of stored history. SDK
storage retains the bounded evidence and claims it needs for replay and duplicate
protection after app history expires.

Use **Recover attempt** with the original app attempt ID and input after a lost
response. **Run again** makes a new attempt against the same immutable expectation.
A committed SDK attempt returns its outcome without another provider call for
the original evidence. The portal additionally binds its attempt ID to the
original submission. A new key is needed for a deliberate retry of an unavailable
receipt. A receipt already claimed cannot verify a second payment.

## Benchmarking

Select a workload and start with 60 scenarios, concurrency 1. The private UI
runs at most one subprocess, at most 600 scenarios, and at most four concurrent
synthetic checks. A run has a 30-second deadline and a cancel button. The
subprocess receives no portal credentials or provider configuration. It opens a
disposable SQLite file and calls the actual SDK with local mock providers.
History retains the last 20 runs. The UI shows resource samples, percentiles,
attempt throughput, rates, and JSON reports.

The Docker CPU and memory budgets are shared between the portal and benchmark
subprocess. The subprocess also caps its V8 old-generation heap at 128 MiB.
Verification and benchmarks do not overlap. For larger workloads, run the
[synthetic CLI](../verification-benchmarks/README.md) on isolated infrastructure.
Report adapter timings and local browser startup separately from real provider
latency.

## VPS operations

Use the [VPS runbook and validation report](../../docs/development/reports/v0.2.0-vps-validation.md)
for the deployed URL, SSH tunnel, CA trust, bootstrap and rotation, health checks,
retention, rollback and recovery.

### Telebirr over Ethio telecom

If the portal is deployed with `deploy/compose.telebirr.yaml`, open WSL on the
computer connected to Ethio telecom. Use the existing `bingo-vps` SSH alias
from the repository root.

```sh
sh apps/verification-playground/deploy/connect-telebirr.sh
```

Leave that terminal open while using **Live Verification**. If the computer
sleeps or changes networks, restart the command after reconnecting to Ethio
telecom, then select **Run again** in the portal. A stopped tunnel yields a
retryable provider network error. `Ctrl+C` stops the tunnel. The script checks
for an existing listener before replacing a stale socket.

If the tunnel is running as the `andhub-telebirr-tunnel` WSL user service, use
`systemctl --user status andhub-telebirr-tunnel` to check it and
`systemctl --user stop andhub-telebirr-tunnel` to stop it. The transient
service can reconnect after an SSH disconnect while WSL is running. Start the
manual command again after a reboot or WSL shutdown.

On the VPS, the Compose override mounts only the private socket directory.
Use the following directory and set `PLAYGROUND_TELEBIRR_TUNNEL_DIR` in the
Compose environment. The Chromium image runs as GID 1001.

```sh
install -d -m 0750 -o root -g 1001 /opt/andhub-verifier/telebirr-tunnel
```

The existing authorized VPS operator SSH account opens the socket to the
fixed Telebirr receipt host on port 443. The library still checks the bank
certificate over the tunnel. See the [SSH manual](https://man.openbsd.org/ssh.1)
for reverse Unix socket forwarding. To return to direct Telebirr HTTPS, omit
the Telebirr Compose override and recreate only `playground`.

### Authorized live smoke checklist

1. Verify trusted HTTPS, administrator sign-in, and a successful synthetic
   receipt. Confirm the live provider is enabled and the checkout runs the
   intended commit.
2. For Telebirr, register one expectation using an authorized existing receipt's
   amount, recipient, invoice and timestamp window. Submit that receipt once.
3. Repeat once for CBE with the Chromium sandbox active.
4. Record the provider, outcome code, stage, retryability, parsed checks and
   elapsed durations. Keep the evidence and private recipient values out of
   notes and logs. Replay the same committed attempt ID to confirm reuse.
