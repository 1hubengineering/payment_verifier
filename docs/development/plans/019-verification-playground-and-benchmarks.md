# Live verification playground and synthetic benchmarks

## Outcome and scope

Implement the internal playground and benchmark suite in order against the local SDK
0.2.0. Both applications use private `0.0.0` packages. The playground
is a single-operator receipt verification tool and the benchmark uses synthetic
adapters exclusively.

## Evidence and decisions

- SDK 0.2.0 already exports browser-safe detection, exact ETB parsing, amount policy
  comparison, expectation registration, prepare/complete, and detailed outcomes.
  Expected recipient accounts are matched by last four digits. Payment type is
  extracted where available but the current expectation contract has no such check.
- The official providers remain behind server-side SDK calls. Timers wrap public
  boundaries. Live transport, CBE rendering, and comparison cannot be separated
  precisely at those boundaries.
- Use a single Fastify process and operator token, an SQLite metadata store,
  separate simulated and live SDK stores, and optional direct SQL storage for live
  SDK state. Keep evidence text out of logs and application history. SDK state
  retains the data required for committed claim protection and replay.
- Browser credential and pending request data stay in memory. Recovery after a
  browser restart requires re-entering the original evidence for the same attempt.

## Sequential milestones and validation

- [x] Playground with SDK integration, saved drafts, immutable scenarios, replay,
      redacted reports, responsive React UI, and reusable performance instrumentation.
      Run targeted protected API, browser build and SDK outcome checks.
- [x] Standalone synthetic benchmark with workload and concurrency controls,
      machine-readable results, latency/throughput/CPU/memory and failure recovery.
      Run deterministic correctness tests and a measured local matrix.
- [x] Integrate measured diagnostics, build and smoke-test the container, validate
      cloud deployment constraints, document measured sizing, and run `pnpm verify`.

## Deployment validation

- Built the standard Node container and the pinned Playwright Chromium target
  from the frozen workspace dependency graph.
- Exercised the cloud Compose topology on a private Docker network with Caddy
  TLS, verified the CA, authorized requests, replay and retained history after
  a restart. The Docker host rejected port publishing in this workspace, so
  the smoke tests reached Caddy over the Compose network.
- Confirmed that CBE startup refuses a blocked sandbox. The pinned upstream
  profile needs an additional `chroot` syscall allowance for Chromium's
  unprivileged zygote. Docker still drops all capabilities. The sandboxed
  Chromium probe passed in the official browser image. The existing CBE render
  and parse path also extracted 23,000 ETB minor units from the frozen synthetic
  receipt in a network-disabled container.
- The browser UI smoke and all benchmark runs used synthetic evidence. A live
  smoke checklist is documented for operators with their own authorized receipts.

## Handoff

Milestone 1 passed 18 integration tests, playground type checking, the Vite+
production build, and a sandboxed Chromium smoke test at desktop, 375 px mobile,
and landscape widths. The browser smoke verified an actual SDK tolerance result.

Milestone 2 passed five benchmark tests and a 12-row matrix across concurrency
1, 4, and 16. Every recovery case verified the SDK's replay behavior. The first
matrix used file-backed SQLite on the host's temporary filesystem.

Milestone 3 added per-attempt timings and tested both production container targets
through the private HTTPS topology. The playground initialized configured
PostgreSQL and MySQL live stores in dedicated synthetic databases. The scenario
and receipt traffic in these checks stayed simulated. The benchmark runbook
records file-backed SQLite results, sandboxed browser memory and container sizes.

Workspace verification passed across separate runs. The clean worktree passed
320 workspace tests, 13 checkout-web tests, 11 frozen reference tests, package
and installed-consumer checks, production builds, and the docs smoke test.
The private Docker network run passed all 297 adapter contracts. The original
checkout's formatter stops on the pre-existing untracked
`docs/library-plan/raw-plan-for-v-0-1-2.md` draft, which was preserved.
