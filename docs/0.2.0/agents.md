Install the setup skill when connecting Payment Verifier to an app. Use the troubleshooting skill for provider, retry or storage problems.

From your application directory, after the skills are available in the repository:

```sh
npx skills@1.9.0 add 1hubengineering/payment_verifier --skill payment-verifier-setup --skill payment-verifier-troubleshoot
```

For a local checkout, pass its absolute path instead of the GitHub slug. Select your client, reload its skills, and invoke `$payment-verifier-setup` or `$payment-verifier-troubleshoot` in Codex. `npx skills@1.9.0 list` shows installed skills.

### Connect the documentation server

Clone the Payment Verifier repository, install the pinned Node runtime and workspace dependencies, then generate the 0.2.0 catalog:

```sh
vp env install
pnpm install --frozen-lockfile
pnpm docs:prepare
codex mcp add payment-verifier-docs -- node "$PWD/scripts/docs-mcp.mjs"
codex mcp list
```

Run those commands from the Payment Verifier repository root. If your client cannot find Node, use the absolute path from `command -v node`. For another MCP client, configure `node` with the absolute path to `scripts/docs-mcp.mjs` as its only argument, using stdio transport. GitHub Pages hosts the website, not the MCP process.

Reload the client and ask it to use `search_docs` for `drizzlePostgresTransaction`, then `get_doc` with the returned ID. The response includes the 0.2.0 declaration and source link pinned to the release commit. Use `pnpm docs:smoke` to test the same connection locally. If the corpus is missing or stale, rerun `pnpm docs:prepare` and restart the client. The server only reads the prepared catalog and does not use credentials or execute examples.
