**Yes—Vite+ and Varlock fit this project, and we should make MySQL, PostgreSQL, and SQLite explicit compatibility targets.** After inspecting `bgub/ts-base`, my recommendation is to **start from Vite+’s official monorepo and library templates**, then borrow useful publishing and CI ideas from `ts-base`.

The main architectural decision is to keep our development tools separate from the requirements we impose on applications that install the library.

| Area | My recommendation |
|---|---|
| Development runtime | Node.js, managed and pinned through Vite+ |
| Development toolchain | Vite+ for checking, testing, and library builds |
| Package manager | pnpm, managed through Vite+ |
| Environment configuration | Varlock for our CLI, worker, examples, and future hosted service |
| Published library configuration | Explicit, typed options supplied by the host application |
| Database support | PostgreSQL, MySQL, and SQLite through storage adapters |
| ORM support | Dedicated Drizzle and versioned Prisma adapters, plus a custom-adapter interface |
| Starting repository | Official Vite+ monorepo with library packages |

## 1. Vite+ is suitable—with one clarification about “runtime”

**Vite+ manages the Node.js runtime; Node.js executes the code.** Its environment tooling selects the Node version and package manager independently. We can therefore use Vite+ to manage the development environment while publishing an ordinary JavaScript library that other applications can consume. [The Unified Toolchain for the Web](https://www.viteplus.dev/guide/env?utm_source=chatgpt.com)

Vite+ has also reached a documented stable 1.0 release, announced on September 28, 2026. It is no longer appropriate to assess it using older descriptions of its beta status. [VoidZero](https://voidzero.dev/posts/announcing-vite-plus-1-0?utm_source=chatgpt.com)

For our repository, these are the relevant commands:

| Task | Vite+ command |
|---|---|
| Create the workspace | `vp create vite:monorepo` |
| Add a library | `vp create vite:library` |
| Run formatting, lint, and configured type checks | `vp check` |
| Run tests | `vp test` |
| Build publishable library output | `vp pack` |

The scaffold commands are built in. `vp check` includes TypeScript checking when the documented `typeAware` and `typeCheck` options are enabled; current scaffolding enables both. `vp test` uses Vitest. [The Unified Toolchain for the Web](https://www.viteplus.dev/guide/create?utm_source=chatgpt.com)

### Use `vp pack` for the library

Vite+’s library build command uses tsdown and supports declaration files, multiple output formats, and source maps. Its documentation recommends placing this configuration inside the `pack` section of `vite.config.ts`. [The Unified Toolchain for the Web](https://www.viteplus.dev/guide/pack?utm_source=chatgpt.com)

For example, an initial package configuration could look like:

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    dts: true,
    format: ["esm"],
    sourcemap: true,
  },
});
```

I would begin with ESM and add CommonJS if our intended consumers require it and we test that output.

**Applications installing our library should be able to retain their existing toolchain.** An application built with Next.js, ordinary Vite, another bundler, or plain Node should consume the published JavaScript and types without adopting Vite+.

The supported runtime versions of the published library should likewise come from its actual code and dependencies. They do not automatically have to match every development-tool requirement.

## 2. Varlock is a good choice at application startup

I would use Varlock for:

- Our verification CLI.
- The optional CBE/browser worker.
- Example applications.
- Integration-test configuration.
- A future hosted API.

The reusable library should accept configuration through its public API.

This boundary matters because Varlock’s documented Node integration can invoke its CLI, populate `process.env`, and initialize its runtime behavior. Those are responsibilities of the process being started. [varlock](https://varlock.dev/integrations/javascript/?utm_source=chatgpt.com)

An integration could eventually look like this:

```ts
// Application entrypoint.
// Package names and verifier APIs below are illustrative.

import "varlock/auto-load";
import { ENV } from "./env";

import { createVerifier } from "@andhub/receipt-verifier";
import { postgresStorage } from "@andhub/receipt-storage/postgres";

export const verifier = createVerifier({
  storage: postgresStorage(existingPool),

  retrieval: {
    timeoutMs: ENV.RECEIPT_TIMEOUT_MS,
  },
});
```

Here, the application chooses Varlock. The verifier receives a database adapter and configuration values.

That lets another consumer provide the same options from its existing configuration system.

### How I would organize the environment configuration

Each runnable application should have its own schema. Shared declarations can be reused where appropriate.

For generated TypeScript types, Varlock specifically documents package-local output:

```dotenv
# @generateTsTypes(path=./env.ts, exposeEnv=local)
```

This avoids the global type augmentations from multiple packages merging into one another. It isolates their types; it does not create separate runtime environments inside one process. [varlock](https://varlock.dev/guides/monorepos/?utm_source=chatgpt.com)

I would also keep deployment configuration and merchant configuration distinct:

| Configuration | Suggested home |
|---|---|
| Database connection, worker concurrency, deployment secrets | Varlock-managed application configuration |
| Receiving accounts, merchant identity, order references | Trusted application/database records |
| Per-verification expectations | Stored payment expectation |
| Core library defaults and constraints | Typed library configuration |

Varlock’s Vite integration performs build-time substitutions for certain environment values. I would use it where appropriate in a demo application, while keeping environment substitution out of the reusable library’s build. Published library code should receive its configuration when the host initializes it. [varlock](https://varlock.dev/integrations/vite/?utm_source=chatgpt.com)

## 3. Yes: all three databases should be part of the intended release

Your clarification changes my earlier suggestion of beginning with only one supported database.

**We can implement incrementally, but PostgreSQL, MySQL, and SQLite should all be release requirements.**

We need to distinguish two things:

1. **Database compatibility:** Which database engines can hold the library’s records?
2. **Integration compatibility:** Which drivers or ORM clients can the application pass to the library?

A proposed support matrix would be:

| Integration path | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Direct SQL, without a host ORM | `pg` adapter | `mysql2` adapter | A selected SQLite driver, initially `better-sqlite3` |
| Drizzle | Tested PostgreSQL integration | Tested MySQL integration | Tested SQLite integration |
| Prisma | Explicitly supported Prisma versions | Explicitly supported Prisma versions | Explicitly supported Prisma versions |
| Another ORM | Custom storage adapter | Custom storage adapter | Custom storage adapter |

**This is the intended compatibility contract, not functionality already implemented.**

### One current Prisma detail affects this matrix

The current Prisma ORM 8 documentation describes PostgreSQL and SQLite transaction support, while describing MySQL as an early preview focused on reads and raw SQL. Prisma’s version 7 documentation explicitly lists all three target databases. [prisma.io](https://www.prisma.io/docs/orm/fundamentals/transactions?utm_source=chatgpt.com)

Therefore, I would publish a **versioned Prisma compatibility policy**:

- A tested Prisma 7 adapter can target all three databases.
- Prisma 8 should receive its own adapter validation.
- Prisma 8 MySQL support should be evaluated against the write and transaction operations our adapter actually needs.

We should avoid a blanket promise such as “works with every Prisma version.” The client API and supported operations can change across major versions.

### “Other ORMs” should have an extension contract

The core should accept something like a `VerificationStorage` interface.

That interface would define the operations the verifier needs, such as:

- Load a payment expectation.
- Record a verification attempt.
- Atomically claim a transaction.
- Resolve duplicate submissions.
- Persist an outcome.
- Append a durable event.

An integration with another ORM can implement that interface and run our shared adapter tests.

That is a practical meaning of **ORM-independent**: the verification logic depends on our storage contract, while each adapter translates that contract into the selected database access system.

## 4. Kysely could help implement the direct SQL adapters

For the “without ORM” path, I would consider **Kysely as an internal implementation detail**.

Its official documentation includes PostgreSQL, MySQL, and SQLite dialects using `pg`, `mysql2`, and `better-sqlite3`, respectively. [Kysely](https://www.kysely.dev/docs/getting-started?utm_source=chatgpt.com)

That gives us two reasonable implementation choices:

| Approach | Benefit | Cost |
|---|---|---|
| Parameterized SQL written separately for each database | Very explicit control over each query | More SQL and dialect differences to maintain |
| Kysely inside the SQL adapter | Shared query construction across the three engines | An additional adapter dependency and abstraction |

**My preference is Kysely inside the direct SQL adapter**, provided a small prototype confirms the transaction and schema behavior we need.

The host application would still have a no-ORM integration. It would not need to adopt Kysely throughout its codebase, and Kysely-specific types should stay out of the verifier core’s public API.

Drizzle and Prisma would retain their own adapters, particularly for applications that need verification records to participate in an existing ORM transaction.

### Sharing a database does not automatically share a transaction

This is the most consequential integration detail.

If a host application opens a Prisma transaction and the library opens a separate SQL connection, those operations do not become atomic merely because they use the same database URL.

Node-postgres explicitly requires statements in one transaction to use the same client. Drizzle exposes a transaction-scoped object, and Prisma’s current documentation similarly directs helpers to use the caller’s transaction context. [node-postgres.com](https://node-postgres.com/features/transactions?utm_source=chatgpt.com)

Our adapter contract should therefore support transaction-scoped execution where the selected integration permits it.

Provider retrieval should happen before the short database transaction. Inside that transaction, the library can recheck the relevant state, enforce uniqueness, persist the receipt evidence, and record the event.

The distinction from our existing plan still applies: a receipt-match transaction records receipt evidence and claims. Settlement confirmation and fulfillment retain their separate meaning.

## 5. My assessment of `bgub/ts-base`

I inspected the repository’s actual configuration, source, and workflows at commit [`3c964a5`](https://github.com/bgub/ts-base/commit/3c964a5e1b550b8302969728cc9814874f15f0f1).

**It is a useful general TypeScript library starter. It would require substantial adaptation to match your chosen toolchain and storage architecture.**

### What it already provides

| Existing feature | Where I checked it | Value for our project |
|---|---|---|
| ESM package exports and declaration-file paths | [Package manifest](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/package.json) | A useful packaging reference |
| Separate Node and browser builds through tsdown | [Build configuration](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/tsdown.config.ts) | Demonstrates separating runtime-specific entrypoints |
| Strict TypeScript configuration | [TypeScript configuration](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/tsconfig.json) | A sensible baseline |
| Vitest coverage thresholds | [Test configuration](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/vitest.config.ts) | Useful testing setup |
| Build, lint, test, and coverage workflow | [CI workflow](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/.github/workflows/ci.yml) | A CI reference |
| Release Please and publishing steps | [Release workflow](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/.github/workflows/release-please.yml) | Ideas for release automation |

### What I would change for our library

**1. Consolidate its tooling into Vite+.**  
Its package scripts currently call Biome, tsdown, and Vitest separately. We would move to the Vite+ commands and configuration discussed above. [Source: package scripts](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/package.json).

**2. Introduce a workspace structure.**  
The inspected repository is organized around one published package. Our optional storage and ORM integrations benefit from independent dependency boundaries.

**3. Replace its runtime validation assumptions.**  
Its CI currently runs Node 20. Current Vite+ testing documentation requires newer supported Node ranges, and Varlock’s documented Node integration requires Node 22 or higher. Our development and CI versions would need to be selected accordingly. [Source: current CI](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/.github/workflows/ci.yml). [The Unified Toolchain for the Web](https://www.viteplus.dev/guide/test?utm_source=chatgpt.com)

**4. Tailor its browser and bundle-size setup.**  
The template publishes a browser entry and sets a 3.5 KB limit for that browser bundle. Our main package is a backend integration; we should define package-size and dependency checks around that purpose. [Source: package metadata and size configuration](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/package.json).

**5. Add the actual storage architecture.**  
The template’s sample source contains small utility functions. Database adapters, migrations, transaction claims, and ORM integration tests would be our implementation work. [Source: sample core](https://github.com/bgub/ts-base/blob/3c964a5e1b550b8302969728cc9814874f15f0f1/src/internal.ts).

That is why I would use it as a reference. Starting with the tooling we have already selected avoids migrating a large part of the starter immediately.

## 6. Which alternative fits better?

Here is how I would rank the relevant choices **for this particular project**:

| Starter | Assessment |
|---|---|
| **Official Vite+ monorepo and library templates** | **First choice.** Directly matches the requested toolchain and supports adding libraries to a workspace. |
| **`bgub/ts-base`** | Useful source of packaging, tests, and release-workflow ideas. Requires the adaptations above. |
| **`antfu/starter-ts`** | Strong general library reference, especially for package validation. Carries additional author-specific tooling and conventions. |
| **`unjs/template`** | A compact alternative built around the UnJS tool choices. Less direct alignment with our Vite+ decision. |

Vite+ explicitly provides both `vite:monorepo` and `vite:library`, along with shared workspace configuration and package-level configuration. [The Unified Toolchain for the Web](https://www.viteplus.dev/guide/create?utm_source=chatgpt.com)

For the other two, I checked their current files rather than relying on older descriptions:

- **Antfu’s starter currently uses tsdown**, with declaration generation, exports generation, and `publint` in its build configuration. Its [package manifest](https://github.com/antfu/starter-ts/blob/main/package.json) also includes ESLint, Knip, release tooling, and hook setup. I would borrow the package-validation ideas. [GitHub](https://github.com/antfu/starter-ts/blob/main/tsdown.config.ts?utm_source=chatgpt.com)
- **UnJS’s current template uses `obuild`**, Oxlint/Oxfmt, Vitest, and changelogen, as shown in its [package manifest](https://github.com/unjs/template/blob/main/package.json). Adopting it would introduce another build convention to replace or reconcile.

The starter should make the selected architecture easier to maintain. None of these templates automatically supplies multi-database correctness.

## 7. The repository structure I would use

A modest monorepo would give us useful dependency isolation:

| Proposed location | Responsibility |
|---|---|
| `packages/verifier` | Public API, matching logic, types, provider and storage contracts |
| `packages/storage-sql` | PostgreSQL, MySQL, and SQLite integrations without a host ORM |
| `packages/adapter-drizzle` | Integration with supported Drizzle clients and transactions |
| `packages/adapter-prisma` | Integration with explicitly supported Prisma versions |
| `packages/provider-cbe` | CBE implementation and its browser-related dependencies where required |
| `apps/cli` | Runnable CLI, configured with Varlock |
| `apps/worker` | Optional background worker, configured with Varlock |
| `examples/fastify-checkout` | An integration showing existing authentication, orders, and checkout |
| `tests/adapter-contract` | Shared behavior tests for every advertised storage integration |

The smaller HTTP provider implementation could initially remain a separate entrypoint within the main package. We can split packages when dependencies or release needs justify it.

The installation goal should be straightforward:

- A PostgreSQL user installs the PostgreSQL integration they need.
- A Prisma user supplies their supported Prisma client.
- A SQLite user does not acquire a MySQL driver.
- Importing the verifier does not start a browser, load environment files, or open connections.
- The host retains ownership of a database connection or pool it passes in.

Separate packages or carefully designed subpath exports can provide that experience. For this project, I favor separate ORM adapter packages because their dependency and version requirements are distinct.

## 8. What we must test before claiming compatibility

The release requirement should be **consistent behavior across the advertised combinations**.

Each adapter needs to pass the same meaningful tests:

| Test | Required result |
|---|---|
| Two concurrent claims for the same transaction | One accepted claim and a consistent conflict result |
| Repeating the same submission for the same payment | The existing result is returned consistently |
| Failure partway through a database operation | Related changes roll back together |
| Retrying after a crash or interrupted response | No duplicate claim or business effect |
| Joining a supported host transaction | Library operations follow that transaction’s commit or rollback |
| Applying and upgrading the schema | Expected tables and constraints remain valid |
| Installing the built package in a consumer project | Exports, declarations, and optional dependencies resolve correctly |

We also need explicit migration paths:

- SQL migrations for direct database integrations.
- Drizzle schema definitions integrated with the host’s migration workflow.
- Prisma schema or contract additions appropriate to the supported version.

One migration workflow should own the library’s tables in an installation.

To keep development manageable on your laptop, I would run the fast unit tests and SQLite checks routinely, then run PostgreSQL/MySQL and the full ORM matrix in CI or on demand. Every combination we advertise still has to pass before release.

## The setup I recommend adopting

I would proceed with these technical decisions:

1. **Official Vite+ monorepo**, using its library template for packages.
2. **Node.js and pnpm managed through Vite+**, with pinned development versions.
3. **Varlock for runnable applications and test infrastructure.**
4. **An explicitly configured verifier core** that consumers can use with their existing environment system.
5. **PostgreSQL, MySQL, and SQLite as first-release database targets.**
6. **A direct SQL adapter, a Drizzle adapter, and versioned Prisma support.**
7. **A documented custom-adapter contract** for other ORMs.
8. **Package and database integration tests** added to the starter’s basic checks.

The initial scaffold would use the documented commands:

```bash
vp create vite:monorepo
```

Then, from the workspace, add the needed packages with:

```bash
vp create vite:library
```

**My choice is the official Vite+ starting point, with selected ideas from `ts-base` and Antfu’s package checks.** That fits your tool preferences and gives us room to implement the database support deliberately. This assessment is based on repository and documentation review; the combined runtime integrations still need to be exercised in the implementation.