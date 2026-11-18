# Prisma 7 receipt storage

Private development preview. The shared contract suite passes for Prisma CLI,
Client and official driver adapters **7.10.1** on PostgreSQL 18.7, MySQL 8.4.13 and
local SQLite. No Prisma 8 prerelease, other client major or remote SQLite service
is advertised.

| Database        | Tested Prisma driver boundary                                  |
| --------------- | -------------------------------------------------------------- |
| PostgreSQL 18.7 | @prisma/adapter-pg 7.10.1 / pg 8.23.1                          |
| MySQL 8.4.13    | @prisma/adapter-mariadb 7.10.1 / mariadb 3.5.4                 |
| Local SQLite    | @prisma/adapter-better-sqlite3 7.10.1 / better-sqlite3 12.11.1 |

The SQLite native dependency is selected by Prisma's official adapter. It differs
from direct SQL's better-sqlite3 13.2.0. Install/build native dependencies for the
Node version that will run the application. Workspace Node 26 setup required the
node-gyp fallback; Node-gyp is a development tool, never a core runtime dependency.

Install this adapter and the exact Prisma Client peer. Hosts own client generation,
chosen driver adapter, database configuration and connection lifetime. The library
receives the generated host client and calls its model delegates and actual
interactive transactions; it does not open an unrelated SQL pool or disconnect
any client.

## Schema and configuration

Append the distributed `schema/postgres.prisma`, `schema/mysql.prisma` or
`schema/sqlite.prisma` model definitions to your selected Prisma datasource schema,
then generate your host client. The model name `ReceiptVerifierRecord` and mapped
v1 table/field names are required. Tests generate real clients directly from these
same model definitions and execute their queries against each selected engine.

The supported migration owner is the shared explicit SQL v1 migration before
traffic. Hosts can incorporate these model definitions in their own migration
workflow after reviewing the generated SQL. No Prisma Migrate automation/version
is claimed as tested; one owner must manage the record tables and version metadata.
Never migrate a second shadow store for verification records.

```ts
import { prismaStorage, prismaTransaction } from '@1hubengineering/receipt-verifier-adapter-prisma';

const storage = prismaStorage(hostPrismaClient);
// Configure the core verifier with storage and trusted provider instances.
const prepared = await verifier.prepare(authorizedSubmission);
await hostPrismaClient.$transaction(
  async (tx) => {
    const result = await verifier.complete(
      prepared,
      prismaTransaction(tx, {
        isolationLevel: 'Serializable',
      }),
    );
    // Host writes through tx follow this same commit/rollback.
    // Receipt evidence never authorizes settlement or fulfillment.
  },
  { isolationLevel: 'Serializable' },
);
```

The policy argument is mandatory: the caller must actually select Serializable
on the enclosing Prisma transaction. Types require the receipt model contract and explicit Serializable policy.
Prisma 7.10.1 retains `$transaction` on its transaction proxy and transaction type;
that property's presence cannot distinguish a full client from an active callback
transaction. The helper does not infer ownership from private fields. Supply the callback's actual
tx object, never cast a whole client into that role. Caller commit/rollback and
whole-transaction retry remain caller-owned; preparation is refused on scoped
storage. A result is provisional until that host transaction commits.

Library-owned transactions request Serializable, 5-second acquisition/run bounds
and at most eight whole-transaction conflict retries. Tests exposed both Prisma
P2034 and raw driver-adapter commit conflicts; recognized serialization, uniqueness
and SQLite timeout/busy errors remain retryable storage conflicts. They never
become payment success or a false provider mismatch.

The core enforces immutable expectations, exact ETB comparisons, tenant-scoped
idempotency, shared-store global receipt claims and atomic evidence/results/outbox.
All outcomes retain settlement `UNCONFIRMED`. The host owns authentication, order
permissions, retention, settlement, fulfillment and idempotent event consumers.

Validation includes the same 26 cases as direct SQL and Drizzle: actual caller
transactions, mid-write rollback, independent clients and synchronized processes
racing for claims, response-loss replay after restart, tenant isolation and
cancellation/expiry. Provider evidence is deterministic synthetic data; no live
bank request or settlement proof is claimed.

The shared suite also tests encrypted durable acceptance, queue/alias bounds,
retry rollback, persisted provider pause, lease fencing, atomic job completion,
retention and actual SIGKILL recovery/exhaustion on this integration.

For a given SQLite file, use only one native SQLite implementation in each
process. Opening better-sqlite3 13, Prisma's separate native build or libSQL
against that file together in one process is unsupported: SQLite documents
POSIX locking hazards for multiple linked copies. Run a different migration
owner in a separate process, then use the selected host ORM/client normally.
Our ORM tests isolate direct-SQL maintenance in short-lived processes and keep
actual ORM connections caller-owned throughout. Different processes coordinate
through the file's normal locks; no adapter reconnects a supplied client. See
[SQLite's locking guidance](https://www.sqlite.org/howtocorrupt.html#multiple_copies_of_sqlite_linked_into_the_same_application).
