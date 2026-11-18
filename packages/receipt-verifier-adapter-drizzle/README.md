# Drizzle receipt storage

The workspace uses `drizzle-orm@rc` and development-only `drizzle-kit@rc`, both
resolved to **1.0.0-rc.5** in pnpm-lock.yaml. Its Drizzle paths pass the same
27-case contract suite on the integrations below. Package versions remain 0.1.0
at the user's request. This source upgrade is not the immutable npm 0.1.0 release,
which still requires Drizzle 0.45.4; see the [published source](https://github.com/1hubengineering/payment_verifier/tree/v0.1.0/packages/receipt-verifier-adapter-drizzle).

| Adapter subpath | Host client                       | Engine                |
| --------------- | --------------------------------- | --------------------- |
| `/postgres`     | node-postgres 8.23.1              | PostgreSQL 18.7       |
| `/mysql`        | mysql2 3.24.6 (promise pool)      | MySQL 8.4.13          |
| `/sqlite`       | @libsql/client 0.17.4, local file | bundled SQLite 3.45.1 |

The libSQL 0.18.0 client fails the concurrent independent-client/process tests
with a persistent SQLITE_BUSY after a failed BEGIN; a minimal native-client
reproduction confirms that regression. It is excluded from this compatibility
contract. Only the locked v1 RC is validated; stable v1, other RC revisions,
better-sqlite3's synchronous Drizzle callback, remote libSQL/Turso and other
drivers are not advertised.

Supply the v1 RC Drizzle runtime peer and only the selected driver. Driver peers are optional
and exact; the core and adapter do not open connections or read environment files.

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  drizzlePostgresStorage,
  drizzlePostgresTransaction,
} from '@1hubengineering/receipt-verifier-adapter-drizzle/postgres';

const db = drizzle({ client: hostPool });
const storage = drizzlePostgresStorage(db);
// Configure the core verifier with this storage and trusted provider instances.
const prepared = await verifier.prepare(authorizedSubmission);
await db.transaction(
  async (tx) => {
    const result = await verifier.complete(prepared, drizzlePostgresTransaction(tx));
    // Other host writes on tx follow this same commit or rollback.
    // Result is receipt-only; independent settlement is still required.
  },
  { isolationLevel: 'serializable' },
);
```

MySQL exports `drizzleMysqlStorage` and `drizzleMysqlTransaction`; SQLite exports
`drizzleSqliteStorage` and `drizzleSqliteTransaction`. Pass the actual ORM
transaction to scoped helpers; plain database handles are rejected. Scoped helpers
perform no begin/commit/rollback, provider retrieval or client disposal. The caller
retries its whole transaction on `StorageConflict`. Library-owned transactions
have bounded conflict retries and use serializable isolation on PostgreSQL/MySQL.
Every query runs through the provided Drizzle object and its actual transaction;
there is no hidden direct-SQL connection.

The core owns immutable expectations, exact comparison, global shared-store claims,
idempotency and atomic evidence/results/events. All results retain settlement
`UNCONFIRMED`. The host owns authorization, connection lifetime, settlement,
fulfillment and event consumption.

## Schema ownership

Each subpath exports `receiptVerifierRecords` and `receiptVerifierSchema` table
objects with the shared v1 names, primary keys and JSON text payload. The supported
migration path is the explicit SQL adapter's `migrate` step before traffic, owned
by one deployment/migration process. Hosts can incorporate the exported definitions
into their existing migration workflow after reviewing the generated SQL.
`pnpm check:drizzle` validates Kit RC local `up`/`check` against empty scratch
histories and exports these two table definitions for PostgreSQL, MySQL, SQLite
and Turso. PostgreSQL reports the expected schema_changed warning because the
library has no Kit history. No automatic schema synchronization, database history
upgrade or applied Kit migration is claimed.
Do not let two independent migration owners manage these tables. Do not create a
second store for ORM verification records. See the direct SQL package for v1
schema, retention and upgrade policy.

Validation uses real engine/client queries, exact caller Drizzle transaction
rollback and commit, mid-write fault injection, synchronized child-process races,
process-restart replay, tenant isolation and idempotency. No live provider traffic
or settlement behavior is tested or claimed.

Installed consumer API checks use the workspace's TypeScript 7.0.2
`skipLibCheck: true` policy; no full vendor-declaration compatibility is claimed. Strict API assignments and negative caller-transaction checks pass
with only the selected engine's peers installed. Core/direct-SQL consumers also
pass full declaration checking without that option.

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

## v1 upgrade and agent tooling

Client constructors use `drizzle({ client })`. Public adapter generics accept v1
`AnyRelations`, including clients built with `defineRelations`; scoped helpers
validate the new PgAsyncTransaction/MySqlAsyncTransaction/SQLiteAsyncTransaction
classes. Table names, columns and the shared store version remain unchanged.
No legacy `relations()` or `db.query` calls exist to migrate.

Kit's bundled `drizzle` skill (revision 15) is installed under this package's
`.agents/skills/drizzle`, with a project-root discovery link. The unchanged topic
files retain their upstream license. Project `.codex/config.toml` launches the
installed Kit in this package. A direct stdio initialize/tools-list handshake
passed; reload Codex to activate the newly saved server in the current session.
No user-level configuration or permission settings are changed.

There are no Kit migration files, journal, snapshots or Drizzle config in this
library. Hosts keep one migration owner, currently `await storage.migrate()` in
their own migration process. This upgrade does not require a database-history
conversion. Applied host history was not inspected and no pending migration is
inferred. Hosts with their own Kit history must separately follow the official
[v1 upgrade guide](https://orm.drizzle.team/docs/upgrade-v1): preserve SQL and the
full snapshot chain, then review history matching before applying any migration.
