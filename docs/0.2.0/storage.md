Choose storage based on the database client your server already owns. Use one shared store and one migration owner.

**Initialize a fresh store for 0.2.0.** Keep active 0.1.1 stores on 0.1.1 until a
tested cutover preserves their existing receipt claims. Use the
[development cutover](https://github.com/1hubengineering/payment_verifier/blob/main/docs/development/plans/017-verification-contract-0.2.0.md#development-and-testing-store-cutover)
only for disposable test stores.

- [Direct SQL](#direct-sql) fits a driver pool or a local SQLite connection without an ORM requirement.
- [Drizzle](#drizzle) fits an existing Drizzle `1.0.0-rc.5` client.
- [Prisma](#prisma) fits a generated Prisma `7.10.1` client with an official driver adapter.

All three integrations cover PostgreSQL 18.7, MySQL 8.4.13 and selected local SQLite clients. Check the [release matrix](https://github.com/1hubengineering/payment_verifier/blob/a876f119fa0da2670b7b2312698cbd538f676b9a/docs/development/compatibility.md) for exact versions. A different SQLite runtime, remote service or ORM major is not covered.

For ordinary submissions, let the verifier manage its short transaction. To join a host transaction, call `verifier.prepare(submission)` **before** opening it. Pass the actual active transaction to the appropriate scoped adapter and call `verifier.complete(prepared, scope)` inside. Use the isolation level shown in the adapter guide. The result is provisional until the enclosing transaction commits.

Retries on `StorageConflict` must repeat the entire host transaction. Do not send mail, credit accounts or call providers within a retryable callback. Receipt evidence, claim, idempotency result and durable event commit together. A local claim only prevents reuse in that store; it is not a settlement record.
