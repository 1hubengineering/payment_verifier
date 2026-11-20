The [searchable API index](https://1hubengineering.github.io/payment_verifier/api/)
lists every public typed export from the checksum-verified npm 0.3.0 archives.
Each declaration links to its release source. Find an export by name or import
path. The same records are available via the [documentation MCP](agents.md).

| Package or entry point                 | Public interface and usage                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@1hubengineering/verifier`            | Verifier factory and expectation, submission, result, operation error and storage types. Also exports comparison and money helpers. [Expected fields and outcomes](configuration.md) · [Persistent checkout](checkout.md) |
| `@1hubengineering/verifier/comparison` | Browser-safe expectation, comparison, amount policy and ETB APIs. [Offline example](quickstart.md) · [Amount policy](amounts.md)                                                                                          |
| `@1hubengineering/verifier/input`      | Browser-safe `detectPaymentInput`, input result and error types, and input size limit. [Evidence formats](evidence.md)                                                                                                    |
| `@1hubengineering/verifier/providers`  | Telebirr retrieval, bounded HTTPS, receipt locators, parser, connectivity diagnostics, and provider result and retrieval types. [Telebirr](telebirr.md) · [Deployment](../deployment.md)                                  |
| `@1hubengineering/verifier/storage`    | Transaction and storage contracts, validators, codecs and storage errors. [Custom adapter example](storage.md)                                                                                                            |
| `@1hubengineering/verifier/jobs`       | Durable verifier factory, policy, job status and lifecycle methods. [Recovery and workers](retries.md)                                                                                                                    |
| `@1hubengineering/storage-sql`         | SQL storage types and protocol, plus `/postgres`, `/mysql` and `/sqlite` factories and scoped transactions. [Direct SQL setup](direct-sql.md)                                                                             |
| `@1hubengineering/adapter-drizzle`     | `/postgres`, `/mysql` and `/sqlite` storage factories, scoped transactions and schema exports. [Drizzle setup](drizzle.md)                                                                                                |
| `@1hubengineering/adapter-prisma`      | Prisma storage and scoped transaction adapters, with schema snippets in the package. [Prisma setup](prisma.md)                                                                                                            |
| `@1hubengineering/provider-cbe`        | CBE provider factory, configuration and browser diagnostics. [CBE setup](cbe.md)                                                                                                                                          |

The CLI, worker process, Fastify checkout and playground are repository
examples. Build your own service using the published interfaces.
[Version and compatibility](../development/releases/0.3.0.md)
