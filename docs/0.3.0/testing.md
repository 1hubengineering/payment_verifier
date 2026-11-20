Choose a mode based on what you need to prove. Use synthetic evidence for
development and CI. Do not load-test official banking endpoints.

| Mode                        | What it exercises                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Offline comparison          | Pure comparison of supplied records, without I/O or persistence. [Offline example](quickstart.md)                                                                                                                                          |
| Mocked integration          | Trusted order mapping, storage, claims, retry and application updates with fixtures. Use a real test database when validating transactions. [Persistent example](checkout.md)                                                              |
| Public synthetic playground | Browser-only behavior with mock evidence on GitHub Pages. It is independent of the private VPS. [Playground](https://1hubengineering.github.io/payment_verifier/playground/)                                                               |
| Private live playground     | Protected, authorized official receipt retrieval against separately trusted order records. The historical [VPS report](../development/reports/v0.2.0-vps-validation.md#authorized-live-smoke) records the tested snapshot and limitations. |
| Synthetic benchmarking      | Controlled, synthetic work in a documented environment. Latency and throughput do not describe bank endpoints. [Reviewed benchmark report](https://1hubengineering.github.io/payment_verifier/benchmarks/)                                 |

From a source checkout with Vite+ installed:

```sh
vp env install
pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm db:up
pnpm verify
pnpm db:down
```

The workspace starts disposable PostgreSQL and MySQL test services with
Docker Compose, bound to loopback. Tests also use local SQLite files, provider
fixtures and browser sandbox checks. For the frozen offline baseline, run
`pnpm test:reference`. For the public site, use `pnpm build:site` and
`pnpm docs:smoke`. These commands run from the checkout root.
[Development conventions](../development/conventions.md) · [Deployment](../deployment.md)

For your application, cover authorization, missing receipt fields, amount
boundaries, duplicate or concurrent claims, dropped responses, provider
unavailability and outer rollback. Test that replay preserves the original
observation and that retrying a host update cannot repeat fulfillment.
Check browser sandbox startup in the actual runtime before enabling CBE.
Keep live smoke-test inputs, operator capabilities and benchmark controls
behind authorized access. Publish reviewed reports or synthetic demonstrations.
