# Third-party boundaries

Project source is ISC under the user's confirmed ownership declaration in
[provenance](docs/development/provenance.md). This grant does not relicense external
packages, browsers or provider content. The five library tarballs externalize
runtime dependencies/peers; no dependency source or browser binary is bundled.
The core has no npm runtime or peer dependencies.

The following licenses were checked in installed package manifests and applicable
license files during release preparation on 18 November 2026:

| Boundary                                 | Selected package/version                                                   | Declared license  |
| ---------------------------------------- | -------------------------------------------------------------------------- | ----------------- |
| Direct SQL runtime                       | Kysely 0.29.9                                                              | MIT               |
| PostgreSQL client                        | pg 8.23.1                                                                  | MIT               |
| MySQL direct/Drizzle client              | mysql2 3.24.6                                                              | MIT               |
| Direct SQLite client                     | better-sqlite3 13.2.0                                                      | MIT               |
| Drizzle peer (published 0.1.0)           | drizzle-orm 0.45.4                                                         | Apache-2.0        |
| Drizzle SQLite client                    | @libsql/client 0.17.4                                                      | MIT               |
| Prisma host client and official adapters | @prisma/client, adapter-pg, adapter-mariadb, adapter-better-sqlite3 7.10.1 | Apache-2.0        |
| Prisma MySQL driver                      | mariadb 3.5.4                                                              | LGPL-2.1-or-later |
| Prisma SQLite driver                     | better-sqlite3 12.11.1                                                     | MIT               |
| Optional browser peer                    | Playwright 1.65.1                                                          | Apache-2.0        |
| Private example                          | Fastify 5.12.8                                                             | MIT               |

In particular, the host-selected MariaDB connector retains its LGPL license; it
is not ISC code and is not copied into this project's npm artifacts. Hosts choose
and install Prisma's official driver adapter separately and must account for the
licenses of their own distributions. Chromium is installed separately by the host
and retains its own component notices. Provider data/HTML is not redistributed.
Development tools, generated test clients and frozen synthetic tests stay outside
library artifacts. The lockfile records the wider development dependency graph.

Drizzle 0.45.4 and @libsql/client 0.17.4 omit license text from their installed
package roots. Their declared grants were also checked against the upstream
[Drizzle license](https://github.com/drizzle-team/drizzle-orm/blob/main/LICENSE)
and the libSQL client's exact published git revision
[MIT license](https://github.com/tursodatabase/libsql-client-ts/blob/889a2ec3130b9fb3b32fda9e19ebd33864efc509/LICENSE).
This inventory records those external boundaries, not a transfer of their grants.

The Drizzle v1 source upgrade selects drizzle-orm 1.0.0-rc.5 (Apache-2.0) and
local development tool drizzle-kit 1.0.0-rc.5 (MIT as declared by its installed
manifest). The installed bundled agent skill is the only new upstream source
copied into this repository. Its unmodified guides come from the official
[Drizzle skill source](https://github.com/drizzle-team/drizzle-orm/tree/beta/drizzle-kit/skills/drizzle).
The upstream repository's Apache-2.0 license is retained alongside those guides
in packages/receipt-verifier-adapter-drizzle/.agents/skills/drizzle/LICENSE.
These guides are outside the project's ISC grant and all npm library archives.
No Drizzle Kit code or dependencies are bundled into the SDK.

The separate static React example includes MIT-licensed shadcn/ui primitives.
The [upstream notice](examples/checkout-web/public/shadcn-ui-LICENSE.txt) is
preserved in the example and copied to its build output, alongside the bundled
dependency licenses. No Shadcnblocks Pro source or assets are included.
