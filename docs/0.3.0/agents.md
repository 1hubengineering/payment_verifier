Start with the host application's code and its installed package versions.
Record what it already uses for authentication, order authorization, database
access, merchant configuration and fulfillment. Reuse those workflows.

## Integration checklist

1. Confirm the installed SDK version, ESM runtime and exact client/engine
   combination. Select the matching [release](../development/releases/0.3.0.md)
   and [adapter](storage.md). Pin the SDK packages at the same version.
2. Confirm the store format, migration owner, shared claim boundary and
   connection ownership. Provision a fresh verifier store for a new
   install. Preserve existing claims on upgrades.
3. Configure the official provider from the [checkout guide](checkout.md).
   Use fixture adapters for tests. Check deployment, egress, browser
   requirements and [security](security.md).
4. Authenticate the buyer, authorize the host order, then register its
   server-owned amount, provider, account name and suffix, expected note
   and time window. Compare the fields against the [API](api.md).
5. Submit the bounded customer locator with the authorized scope and
   original idempotency key. Treat browser recognition as syntactic feedback.
6. Cover all [results and operation errors](configuration.md). Use
   [original-key recovery](retries.md#idempotency) after uncertain completion.
   Use a new key only for a fresh observation after a known result.
7. Wait for the applicable commit. Keep order changes and fulfillment
   independently repeat-safe. Follow the [checkout example](checkout.md).
8. Run [synthetic checks](testing.md) for authorized success, invalid or
   mismatched evidence, timeout, replay, duplicate claim and storage
   failure. Record missing SDK capabilities and unresolved host decisions.

Use real published APIs and examples. Do not invent methods, duplicate
the provider verification logic, create parallel wallets or ledgers, treat
offline `MATCH` as backend verification, trust a client-supplied amount,
assume duplicate protection across separate stores, or assume a durable
job sends notifications.

## Skills

Install the setup skill when connecting Payment Verifier to an app. Use the troubleshooting skill for provider, retry or storage problems.

From your application directory, after the skills are available in the repository:

```sh
npx skills@1.9.0 add 1hubengineering/payment_verifier --skill payment-verifier-setup --skill payment-verifier-troubleshoot
```

For a local checkout, pass its absolute path instead of the GitHub slug. Select your client, reload its skills, and invoke `$payment-verifier-setup` or `$payment-verifier-troubleshoot` in Codex. `npx skills@1.9.0 list` shows installed skills.

## Connect the documentation server

Clone the Payment Verifier repository, install the pinned Node runtime and workspace dependencies, then generate the 0.3.0 catalog:

```sh
vp env install
pnpm install --frozen-lockfile
pnpm docs:prepare
codex mcp add payment-verifier-docs -- node "$PWD/scripts/docs-mcp.mjs"
codex mcp list
```

Run those commands from the Payment Verifier repository root. If your client cannot find Node, use the absolute path from `command -v node`. For another MCP client, configure `node` with the absolute path to `scripts/docs-mcp.mjs` as its only argument, using stdio transport. GitHub Pages hosts the website, not the MCP process.

Reload the client and ask it to use `search_docs` for `drizzlePostgresTransaction`, then `get_doc` with the returned ID. The response includes the 0.3.0 declaration and source link pinned to the release tag. Use `pnpm docs:smoke` to test the same connection locally. If the corpus is missing or stale, rerun `pnpm docs:prepare` and restart the client. The server only reads the prepared catalog and does not use credentials or execute examples.
