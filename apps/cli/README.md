# Trusted operator CLI

Private workspace application. Run `pnpm cli help` from the workspace root.
Varlock validates this application's schema before running its TypeScript entry.
Use absolute input paths: the task runs from apps/cli. This is a local trusted
operator tool; embedded applications still own authentication and order authority.

Commands accept JSON files rather than putting receipt locators in process
arguments. `register` consumes a trusted PaymentExpectation: tenantId, paymentId,
provider, ETB currency, positive integer amountMinor, recipientName, four-digit
recipientAccountLast4, reference, and epoch-millisecond validFrom/validUntil.
The normal submission file contains only tenantId, paymentId, idempotencyKey and
receiptLocator. `status` takes tenantId, paymentId and jobId; `cancel` takes the
payment scope. Outputs are structured JSON; input/runtime errors exit nonzero and
omit raw receipts, paths, secrets and driver errors.

```sh
pnpm cli register /absolute/path/trusted-expectation.json
pnpm cli diagnose /absolute/path/trusted-expectation.json /absolute/path/saved-receipt.html
pnpm cli verify /absolute/path/submission.json
pnpm cli enqueue /absolute/path/submission.json
pnpm cli status /absolute/path/scope-and-job.json
pnpm cli cancel /absolute/path/scope.json
```

`diagnose` compares saved HTML without opening a database, enqueuing or claiming.
Its diagnostic result includes SAVED_HTML provenance and claimCreated=false even
when fields match. There is no unchecked claim command or diagnostic bypass.
Help also performs no database or provider work.

The default store is `.receipt-state.sqlite` at the workspace root, shared with
the worker. Set RECEIPT_DATABASE_FILE to an absolute path for another file. These
apps explicitly own their SQLite handles, enable WAL, migrate the v1 tables and
close handles on completion. The SDK retains caller connection ownership and
supports its separately tested nine database/ORM cells.

Provider traffic defaults disabled. `verify` without configured providers returns
UNABLE_TO_VERIFY and cannot create a claim. Explicit
RECEIPT_ALLOW_PROVIDER_TRAFFIC=true enables the bounded Telebirr provider;
RECEIPT_ENABLE_CBE=true additionally enables CBE with matching Chromium installed
using `pnpm setup:browsers`. No live provider request is needed for validation.

Queue commands also require RECEIPT_JOB_KEY: 64 hex characters encoding a securely
generated random 32-byte key. Configure it in the application's ignored local env
or external environment; there is no default secret. Both applications must use
the same key, timeout and database. Timeout is 1–60000 ms; lease is at least
30 seconds and 1000 ms longer than that timeout. Other queue bounds use the SDK's
conservative defaults. See [durable job operations](../../docs/development/durable-jobs.md)
for retention, event acknowledgment, backup and key rotation responsibilities.
All receipt-only outcomes keep settlement UNCONFIRMED and never authorize delivery.
