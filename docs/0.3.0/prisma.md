Use a Prisma 7.10.1 client generated with the receipt record model. Your app creates and disconnects the client.

Install `@1hubengineering/adapter-prisma@0.3.0`, `@prisma/client@7.10.1` and the corresponding official driver adapter at `7.10.1`: `@prisma/adapter-pg`, `@prisma/adapter-mariadb`, or `@prisma/adapter-better-sqlite3`. Use the Prisma CLI at the same version.

Copy the selected `schema/postgres.prisma`, `schema/mysql.prisma` or `schema/sqlite.prisma` model from the package into your host schema and regenerate. Run the explicit SQL migration before traffic. Then call `prismaStorage(hostPrismaClient)`.

When joining a host write, set the enclosing Prisma interactive transaction to `Serializable` and pass its callback client to `prismaTransaction(tx, { isolationLevel: 'Serializable' })`. Do not cast a whole client into a transaction. See the [0.3.0 Prisma transaction example](https://github.com/1hubengineering/payment_verifier/blob/v0.3.0/packages/adapter-prisma/README.md).

[Storage contract](storage.md) · [Security and privacy](security.md)
