# Optional durable SQLite worker

Private workspace application, configured by its own Varlock schema. Use the same
absolute RECEIPT_DATABASE_FILE, RECEIPT_JOB_KEY and RECEIPT_TIMEOUT_MS as the CLI
that accepted the jobs. Defaults select the shared workspace SQLite file, but no
encryption key is supplied. Provider traffic defaults disabled.

```sh
pnpm worker --help
pnpm worker --once
pnpm worker
```

`--once` attempts one eligible job and exits. The loop runs sequentially and waits
one second after idle, busy, stale or retry-wait outcomes. It emits only outcome
classes. SIGINT/SIGTERM aborts provider work/polling, leaves acknowledged work
recoverable and closes the process's own handle. Storage/runtime failures exit
nonzero with a generic code; a supervisor may restart the process. Persisted
leases fence stale completions and permit another worker after expiry. Real
process crash/recovery is tested across every SDK adapter; this executable chooses
SQLite and deliberately makes no throughput or deployment availability promise.

This worker never settles a payment, credits an account or fulfills an order.
Hosts still own authentication, independent settlement, event delivery and
repeat-safe consumers. Queue capacity remains occupied until explicit retention
maintenance acknowledges events and prunes eligible completed jobs. See the
[CLI configuration](../cli/README.md) and [durable job operations](../../docs/development/durable-jobs.md).
