The renamed Drizzle adapter targets Drizzle ORM 1.0.0-rc.5. The archived 0.1.0 adapter requires Drizzle 0.45.4.

Install `@1hubengineering/adapter-drizzle@0.1.1`, `drizzle-orm@1.0.0-rc.5` and the selected driver:

| Subpath     | Factory                      | Tested driver                 |
| ----------- | ---------------------------- | ----------------------------- |
| `/postgres` | `drizzlePostgresStorage(db)` | `pg@8.23.1`                   |
| `/mysql`    | `drizzleMysqlStorage(db)`    | promise `mysql2@3.24.6`       |
| `/sqlite`   | `drizzleSqliteStorage(db)`   | local `@libsql/client@0.17.4` |

Create the host ORM client and pass it to the selected adapter. Run the direct SQL migration before traffic; do not let a second migration tool manage the same tables. For local SQLite, run migration in a separate process if it uses a different native SQLite implementation.

Call the matching `drizzlePostgresTransaction`, `drizzleMysqlTransaction` or `drizzleSqliteTransaction` inside the ORM callback, passing the callback's actual transaction. The [0.1.1 example](https://github.com/1hubengineering/payment_verifier/blob/v0.1.1/packages/receipt-verifier-adapter-drizzle/README.md) shows PostgreSQL Serializable and explains the synchronous SQLite callback limitation.
