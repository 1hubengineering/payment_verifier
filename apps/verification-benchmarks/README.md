# Synthetic verification benchmarks

This private CLI measures SDK 0.3.0 against the real SQLite adapter with the
shared instrumentation and synthetic Telebirr and CBE provider objects.
It requires no server, credentials or network. A fresh disposable SQLite store
is created for each row. The CLI accepts workload settings and has no
provider URL input.

```sh
vp env install
pnpm install --frozen-lockfile
pnpm build
pnpm benchmark --requests 1200 --warmup 60 --concurrency 1,4,16 > benchmark.json
```

Use `pnpm benchmark --help` for options. Set `TMPDIR` to a directory on the
deployment filesystem to include its storage latency. The default temporary
directory may be backed by RAM. Use `--database memory` for in-process SQLite
with no file I/O. Use `--provider cbe` or `--provider telebirr` to select a
synthetic receipt shape. The default alternates both shapes.

| Workload   | Assertions                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success`  | Every attempt obtains a committed verification.                                                                                                                                                                 |
| `mixed`    | Success, amount, recipient and invoice mismatches, missing receipts and network failures retain their exact SDK codes.                                                                                          |
| `recovery` | Timeout and network results replay with no provider call. A fresh key can verify a later attempt. An injected loss after commit recovers the verified result with the original key and no second provider call. |
| `claims`   | Each pair of distinct expectations sharing one receipt has exactly one claim winner.                                                                                                                            |

Each JSON row contains attempt and scenario throughput, attempt latency and
per-phase nearest-rank percentiles, observed peak concurrent provider calls,
process CPU user/system times and average cores, sampled RSS and heap, process
RSS high-water mark, and database size including WAL files. Recovery reports
elapsed time from injection through successful recovery overall and per fault.
Warm-up and expectation registration run before timed work. Latency covers SDK
and harness work. Timing phases are nested and cannot be added. Approximate RSS
and heap peaks are sampled every 10 ms. A matrix shares one Node process across
its rows. Rerun individual rows in fresh processes for isolated RSS comparisons.

## Measured results

The first run used Node 26.13.1, Linux x64, an Intel Core i7-1365U, six available
logical CPUs, a temporary RAM-backed filesystem and SQLite WAL. Each row used
1,200 measured scenarios after 60 warm-up scenarios, a 3 ms synthetic delay and
a 20 ms simulated timeout. Throughput includes expected failures and replay
attempts. These measurements cover the synthetic SDK path, excluding browser,
HTTP and real provider network time.

| Workload         | Concurrency | Attempts/s | p95 attempt | p99 attempt |
| ---------------- | ----------: | ---------: | ----------: | ----------: |
| Success          |           1 |        248 |     4.71 ms |     5.29 ms |
| Success          |           4 |        964 |     5.53 ms |     6.89 ms |
| Success          |          16 |      1,957 |    12.36 ms |    16.64 ms |
| Mixed            |           4 |      1,000 |     5.13 ms |     7.13 ms |
| Mixed            |          16 |      2,161 |    10.26 ms |    52.54 ms |
| Recovery         |           4 |        852 |    20.79 ms |    21.64 ms |
| Recovery         |          16 |      2,398 |    24.75 ms |    29.43 ms |
| Claim contention |           4 |      1,004 |     5.23 ms |     7.88 ms |
| Claim contention |          16 |      2,250 |    10.32 ms |    12.21 ms |

At concurrency 4, end-to-end recovery p95 was 27.48 ms for timeout, 10.19 ms
for network error, and 5.58 ms for the lost commit response. The matrix peaked at
about 255 MiB sampled RSS and 0.98 CPU cores averaged over a row. File-backed
SQLite and WAL occupied up to 16 MiB for the isolated benchmark stores. Production
volume growth depends on attempts, evidence size, retention of SDK records and
backups.

A second run used the workspace's ext4 filesystem and overlapped other local
verification and build tasks. At concurrency 4 it measured 459 success attempts/s
at 22.80 ms p95. At concurrency 16 it measured 640 attempts/s at 49.91 ms p95.
This is an observation under local contention. Re-run against the target volume
before using these figures for capacity planning.

## Deployment sizing

The standard container used about 153 MiB at the HTTPS smoke check, and the Caddy
container used about 12.5 MiB. An isolated sandboxed Chromium probe in the
pinned CBE image measured about 422 MiB of container memory while the synthetic
page was open, up from 170 MiB at baseline. With the full service running, a
separate probe in the same container recorded about 601 MiB with the browser
open. The existing CBE renderer rendered and parsed the frozen synthetic receipt
in 1.25 seconds inside the browser image with networking disabled. These probes
measure startup and local rendering. Provider latency and live receipt size
remain workload-dependent.

Start an internal instance with 2 vCPUs and 2 GiB host RAM. Compose caps the
backend at 768 MiB with 128 MiB of shared memory and one live request at a time.
The local standard image occupied 464 MB and the browser image occupied 3.99 GB.
Allow at least 10 GiB of free space if building the browser target on the host,
plus a persistent data volume and backups sized to your retention requirements.
