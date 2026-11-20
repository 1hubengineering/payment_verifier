Your application owns and operates the database. The SDK reads and writes the
verification records required by its documented workflow through your configured
storage adapter.

| Owner                    | Responsibility                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application and merchant | Payment accounts, products, prices, customers, orders, invoices, authentication, authorization, financial records, balances, fulfillment, refunds and reconciliation. The merchant receives funds directly. |
| Database operator        | Provisioning, access control, migration, backups, recovery, maintenance, retention policy and connection lifecycle.                                                                                         |
| SDK through its adapter  | Trusted expectation snapshot, lookup outcomes, idempotency, claims, outbox and optional durable verification jobs.                                                                                          |
| Application operations   | Run the backend and any workers, apply business changes once, communicate with customers and escalate unresolved payments.                                                                                  |

## Select an adapter and migrate

Choose [Direct SQL](direct-sql.md) for a host driver, [Drizzle](drizzle.md) for a
tested Drizzle client, or [Prisma](prisma.md) for a generated Prisma 7 client.
All three cover selected versions of PostgreSQL, MySQL and local SQLite. Use
the [release matrix](../development/compatibility.md) for exact pins and the
[migration guide](../development/migrations.md) for the built-in tables.

Initialize a fresh verifier store for a new integration. You can add verifier
tables to an existing application database. Fresh verifier records do not
require clearing orders or any other application tables. Use one migration
owner. For compatible 0.2.0 stores, preserve records and upgrade every process
before creating expectations with the expanded reference rules. Active 0.1.1
stores need a claim-preserving cutover that this release has not validated.
[Release upgrade and rollback instructions](../development/releases/0.3.0.md#upgrade-and-rollback)

Supplied schema templates are optional when using a compatible custom adapter.
Ready-made adapters require their documented schema or supported mappings.
Every adapter must preserve the SDK's storage guarantees.

## Verification data inventory

| Record                                                 | Fields and purpose                                                                                                                                                                                                                                                                                                                            | Write and lifecycle                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format metadata                                        | SDK record format version (0.3.0 uses payload version 2). Built-in adapters also manage SQL schema version.                                                                                                                                                                                                                                   | Introduced by initialization/migration. Preserve with the store.                                                                                                                                                                                           |
| Expectation (required)                                 | Version, immutable `PaymentExpectation`, state `OPEN`, `CANCELLED` or `RECEIPT_CLAIMED`. Includes payment and tenant IDs, trusted provider, ETB amount, policy, name, account suffix, note and window.                                                                                                                                        | Registered by the host. Cancelling or claiming updates state. No SDK expiry deletion.                                                                                                                                                                      |
| Attempt and idempotency binding                        | Version, canonical fingerprint (payment, provider and identifier), and full `VerificationResult`. The hashed key includes tenant and idempotency key.                                                                                                                                                                                         | Completed observed attempts, including unverified ones, persist with their event. A synchronous `INVALID_INPUT` on an unbound key has no attempt. No automatic attempt purge.                                                                              |
| Receipt and provenance (within result, when available) | Normalized provider, transaction ID, status, observed amount, currency, recipient name, last-four account representation, receipt note, transaction time and payment type. Source includes kind, retrieval timestamp, parser version and content hash. The result also includes scope, normalized input, findings and bounded diagnostics.    | Stored with an observed attempt. Encrypted job admission does not encrypt these later result fields.                                                                                                                                                       |
| Claim (verified only)                                  | Hash of provider and official transaction ID, mapped to tenant ID, payment ID and verification ID.                                                                                                                                                                                                                                            | Inserted in the same transaction as the expectation state, attempt and event. No public claim delete or expiry.                                                                                                                                            |
| Outbox                                                 | Event key, event type, creation time and result on completion or job ID and serialized error on job failure.                                                                                                                                                                                                                                  | Created with the corresponding completion. `events(limit?)` scans pending records. Call `acknowledgeEvent(key)` to delete the event. Acknowledgment preserves the claim and attempt.                                                                       |
| Durable jobs (optional)                                | Version, job and order scope, provider, state, attempt count, creation/update/next-run times, fingerprint, expectation digest, ciphertext, aliases, lease and expiry, attempt history, event key, and terminal result/error. Supporting records track active jobs, key aliases, terminal replay and queue counters/circuits/policy signature. | Admission persists the canonical input and primary key encrypted with AES-256-GCM. Terminal transitions clear ciphertext. Pruning eligible acknowledged jobs frees active capacity and drops attempt history while preserving terminal replay and aliases. |

Raw SMS, receipt HTML, balances and full accounts have no default storage
field. The result can include the canonical locator, expected and observed
notes, the provider transaction ID and receipt recipient name. General record
storage is plaintext unless the host adds encryption at rest. A host that
uses saved HTML for diagnostics controls those files and their deletion.
Normal SDK APIs do not purge results, expectations or claims. Treat any
retention change as a migration of the same uniqueness and replay guarantees.
[Result fields](configuration.md) · [Security and privacy](security.md) ·
[Job retention](../development/durable-jobs.md)

## Transactions and duplicate scope

`submit` retrieves before opening its short write transaction. It atomically
commits expectation state, claim when verified, attempt and outbox. Duplicate
protection is shared by all tenants using that one store for a provider
transaction, and a payment can have one claim. Independent stores can each
claim the same receipt. Idempotency key bindings, by contrast, are tenant-scoped.

For a shared host transaction, call `verifier.prepare(submission)` before
opening it, then pass the actual transaction to the matching scoped adapter
and call `verifier.complete(prepared, scope)` inside. Use Serializable or the
documented equivalent. The result is provisional until the outer commit.
Roll back on completion failure and retry the entire caller transaction for
a retryable conflict. Keep providers, emails and other external effects
outside the transaction. Use a repeat-safe host update or event consumer
after commit. [Persistent checkout and crash recovery](checkout.md)

## Custom adapter

Implement `VerificationStorage` with `read` and `transaction(work)`. Within a
transaction, `RecordTransaction` provides `get`, unique `insert`, upsert
`set`, `delete` and ordered prefix `scan(prefix, limit)`. Return `undefined`
for absent keys. Keep the keys byte-exact. Commit or roll back every write
as a unit. Use serializable transactions or equivalent locks with unique
inserts and protected reads and scans. Separate clients and processes must
coordinate on the same data. Signal known retryable concurrency conflicts with
`StorageConflict`. A callback may repeat. Keep effects outside it. Caller-owned
scopes must leave retry, commit and rollback to their owner.

Use the key/scan validators and JSON codecs from `@1hubengineering/verifier/storage`.
The runnable [SQLite example](examples/custom-storage.mjs) uses a custom table,
a dedicated connection, serialized access per instance and `BEGIN IMMEDIATE`
to coordinate writers across connections. It reports contention to the caller
instead of retrying internally. Use the transaction argument within the
callback and keep that scope local. To run the
[adapter check](examples/check-custom-storage.mjs), install the packages from
[checkout](checkout.md), save both files side by side and run:

```sh
node check-custom-storage.mjs "$(mktemp -d)"
```

Run the [shared contract suite](../../tests/adapter-contract) against any adapter
before adopting it. The example check covers a subset of that contract and
does not implement caller-owned transactions.
