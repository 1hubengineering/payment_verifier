# Project skills and MCP

For help using the SDK in another application, see the
[Payment Verifier skills and documentation MCP](../0.1.0/agents.md).
This page covers contributor tools for working on the repository itself.

Neither skills nor MCP are required to install the SDK, run its tests, or build
the static documentation and demo. They are local contributor tools.

## Install and activate

1. Open the trusted repository root in Codex, install the pinned Node runtime
   with `vp env install`, and run `pnpm install --frozen-lockfile`.
2. The tracked `.agents/skills/drizzle` symlink exposes the bundled skill in the
   Drizzle adapter. No registry skill install is needed. If your checkout does
   not support symlinks, restore it on a symlink-capable filesystem or copy the
   bundled skill folder into your personal `.agents/skills/` directory.
3. Start a fresh Codex session and invoke the Drizzle skill explicitly as
   `$drizzle`, or let Codex select it for Drizzle work. The checked-in
   `.codex/config.toml` selects the workspace's pinned Drizzle Kit MCP server.
4. For component work, optionally install the shadcn tool in Codex from the
   [official setup guide](https://ui.shadcn.com/docs/mcp). A CLI alternative is
   `codex mcp add shadcn -- pnpm dlx shadcn@4.23.0 mcp --cwd examples/checkout-web`
   from the repo root. Use a distinct name or skip registration if the editor
   already provides `shadcn`. Don't duplicate registrations.

See the official [Codex skills guide](https://developers.openai.com/codex/skills)
and [MCP guide](https://developers.openai.com/codex/mcp/) for client setup.

## Verify

```sh
codex mcp list
codex mcp get drizzle
pnpm check:drizzle
pnpm dlx shadcn@4.23.0 info --cwd examples/checkout-web
```

`codex mcp list` verifies configuration, not a successful handshake. In a
restarted session, check that the Drizzle tools are available and use the
read-only `check` or `export` command for a local config; do not run `push`
against a live database as a connectivity test. Ask shadcn to list/search the
official registry. Its project config is `examples/checkout-web/components.json`.

## Troubleshoot

- **Missing skill:** check `.agents/skills/drizzle/SKILL.md` resolves, reopen the
  workspace root, and start a fresh session so Codex reloads discovery.
- **Server missing or disabled:** check that the project is trusted and the
  current client loads the project `.codex/config.toml`; restart after editing it.
- **Drizzle cannot start:** ensure `pnpm` is on Codex's PATH and the frozen install
  succeeded. Run `pnpm --filter @1hubengineering/receipt-verifier-adapter-drizzle exec drizzle-kit mcp`
  from the repository root to check the launcher. It speaks MCP on stdio and
  waits for a client; silence alone does not indicate a failure.
- **shadcn cannot find the project:** use the example directory as the server
  working directory or pass `--cwd` from the repo root. The public registry
  needs no authentication. Do not add private registry credentials to tracked
  config, CI, or any browser-accessible environment variable.
- **pnpm reports optional agent skills awaiting approval:** the vendored Drizzle
  skill already works without them. Use `pnpm approve` only if you intend to
  install another skill and have reviewed its source.
