Use the direct SQL adapter with a host-owned driver and run its explicit migration before accepting receipts.

Install `@1hubengineering/receipt-verifier-storage-sql@0.1.0` and the selected driver:

| Subpath     | Factory                   | Tested driver                  |
| ----------- | ------------------------- | ------------------------------ |
| `/postgres` | `postgresStorage(pool)`   | `pg@8.23.1`                    |
| `/mysql`    | `mysqlStorage(pool)`      | callback-style `mysql2@3.24.6` |
| `/sqlite`   | `sqliteStorage(database)` | `better-sqlite3@13.2.0`, local |

Run `await storage.migrate()` from your deployment's migration process. Pass that storage boundary to the core. Your host owns closing the underlying pool or connection.

For shared transactions use `postgresTransaction`, `mysqlTransaction`, or `sqliteTransaction` on the exact started driver connection. Select Serializable for PostgreSQL/MySQL and keep the enclosing transaction active until completion. See the [0.1.0 migration and transaction examples](https://github.com/1hubengineering/payment_verifier/blob/v0.1.0/packages/receipt-verifier-storage-sql/README.md).
