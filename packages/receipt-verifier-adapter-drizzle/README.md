# Drizzle receipt storage

Private development preview. Drizzle **0.45.4** passes the same 15-case contract
suite on these exact integrations:

| Adapter subpath | Host client                       | Engine                |
| --------------- | --------------------------------- | --------------------- |
| `/postgres`     | node-postgres 8.23.1              | PostgreSQL 18.7       |
| `/mysql`        | mysql2 3.24.6 (promise pool)      | MySQL 8.4.13          |
| `/sqlite`       | @libsql/client 0.17.4, local file | bundled SQLite 3.45.1 |

The libSQL 0.18.0 client fails the concurrent independent-client/process tests
with a persistent SQLITE_BUSY after a failed BEGIN; a minimal native-client
reproduction confirms that regression. It is excluded from this compatibility
contract. Drizzle 1.0 prereleases, better-sqlite3's synchronous Drizzle transaction
callback, remote libSQL/Turso and other drivers are not advertised.

Install the Drizzle peer and only the selected driver. Driver peers are optional
and exact; the core and adapter do not open connections or read environment files.

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  drizzlePostgresStorage,
  drizzlePostgresTransaction,
} from '@andhub/receipt-verifier-adapter-drizzle/postgres';

const db = drizzle(hostPool);
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
into their existing migration workflow after reviewing the generated SQL; no
Drizzle Kit version or automatic schema synchronization is claimed as tested.
Do not let two independent migration owners manage these tables. Do not create a
second store for ORM verification records. See the direct SQL package for v1
schema, retention and upgrade policy.

Validation uses real engine/client queries, exact caller Drizzle transaction
rollback and commit, mid-write fault injection, synchronized child-process races,
process-restart replay, tenant isolation and idempotency. No live provider traffic
or settlement behavior is tested or claimed.

Installed consumer API checks use the workspace's TypeScript 7.0.2
`skipLibCheck: true` policy. Drizzle 0.45.4's upstream declarations emit errors
when checked in full by this compiler; no full vendor-declaration compatibility
is claimed. Strict API assignments and negative caller-transaction checks pass
with only the selected engine's peers installed. Core/direct-SQL consumers also
pass full declaration checking without that option.
