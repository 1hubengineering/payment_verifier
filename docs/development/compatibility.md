# Validated compatibility

The matrix below describes the workspace and the renamed 0.1.1 release candidate. The old npm 0.1.0 uses
Drizzle 0.45.4; its immutable [release matrix](https://github.com/1hubengineering/payment_verifier/blob/v0.1.0/docs/development/compatibility.md)
records that release's compatibility. The renamed packages do not replace those artifacts.

The library is ESM-only for Node ^24.22.3 or ^26.13.1. Both minimum versions run
full hosted CI on Linux. No CommonJS, browser runtime, Bun/Deno, macOS/Windows or
other engine/client versions are advertised. The core has no npm runtime or peer
dependencies. All adapters receive host-owned connections and open nothing at import.

| Integration                                | PostgreSQL                    | MySQL                                    | Local SQLite                                             |
| ------------------------------------------ | ----------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Direct SQL / Kysely 0.29.9                 | 18.7 / pg 8.23.1              | 8.4.13 / mysql2 3.24.6                   | 3.54.1 / better-sqlite3 13.2.0                           |
| Drizzle 1.0.0-rc.5                         | 18.7 / pg 8.23.1              | 8.4.13 / mysql2 3.24.6                   | 3.45.1 / @libsql/client 0.17.4                           |
| Prisma CLI/Client/official adapters 7.10.1 | 18.7 / adapter-pg / pg 8.23.1 | 8.4.13 / adapter-mariadb / mariadb 3.5.4 | 3.53.2 / adapter-better-sqlite3 / better-sqlite3 12.11.1 |

Each of the nine cells runs the same 27 contract cases: immutable expectations,
exact matches, atomic evidence/claim/result/event writes, tenant/idempotency/race
protection, actual host rollback/commit, independent processes, stored-evidence privacy and
durable jobs.
Jobs add encrypted input, bounded admission/aliases, persisted retry/circuit state,
lease fencing, final-write fault rollback, retention and actual SIGKILL recovery.
Installed npm consumers independently check exports/types and peer isolation.
Drizzle uses skipLibCheck for upstream declarations while strict application and
negative API checks pass; core/SQL/Prisma consumers pass full declaration checking.

Drizzle's synchronous better-sqlite3 callback is not an asynchronous transaction
integration. libSQL 0.18.0 remains excluded after a native concurrency reproduction;
Prisma 8 prereleases are untested. No remote SQLite service or network filesystem
is validated. Use one native SQLite implementation per process for any one file;
the direct migration owner runs in a separate process for ORM SQLite. This avoids
SQLite's documented multiple-copy locking hazard. Never infer all SQLite drivers
or arbitrary ORM majors from the selected cells above.

Telebirr supports the saved synthetic bilingual/span/label-value/v5 invoice
layouts and bounded allowlisted HTTPS. CBE adds Playwright 1.65.1 and its matching
Chromium 159.0.8154.6 (build 1255), with mocked HTTPS and real browser failure tests. Chromium OS sandboxing and a
locale/timezone-only browser environment are mandatory; Linux tests inspect real
renderer seccomp/PID namespaces. The host must support unprivileged sandboxed
Chromium and provide worker filesystem/memory/process confinement.
Only inline-renderable CBE layouts are supported: external scripts/assets, IPv6,
redirects and compressed provider responses are refused. Malformed or unsupported
structures fail closed. No live bank compatibility, provider permission, service
availability, throughput, settlement or fulfillment guarantee is made.

The private CLI/worker select direct local SQLite; the private Fastify 5.12.8
example demonstrates host authority using SQLite and a provider-free loopback demo.
These applications remain source examples, not published executables or a hosted
payment platform. Hosts own auth, order authority, settlement, fulfillment, backups,
retention, plugin behavior, secret management and repeat-safe event consumers.

The workspace explicitly selects ORM/Kit rc tags, currently both 1.0.0-rc.5.
The host ORM is a runtime peer restricted to the v1 RC series; validation covers
only the lockfile's resolved version. Driver pins remain unchanged. Kit's local
up/check/export checks cover PostgreSQL, MySQL, SQLite and Turso without database
access. They validate exported schema and empty local histories, not applied
migration history or automatic migration ownership. The direct SQL migration
remains the shared v1 owner.
