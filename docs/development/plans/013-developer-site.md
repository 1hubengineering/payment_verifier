# 013 — Developer site and agent documentation

## Outcome and scope

Give the existing Pages project a discovery page, a guide, and a searchable TypeScript API
reference. Ship the same documentation to an installable read-only MCP server and add two
agent skills. Assess all five public npm names without changing the registry.

## Evidence and decisions

- Vite+ puts installation on the homepage and task navigation in the guide. Keep this
  progression, with Payment Verifier's own warm paper, deep green, and mint visual system.
- UI/UX Pro Max recommended a Swiss-style documentation site with prominent discovery,
  keyboard focus, high contrast and mobile reflow. Use system sans/monospace fonts,
  static navigation and a usable API index even without JavaScript.
- Label the docs 0.1.0 and generate reference data from the published npm declaration
  entry points. The workspace Drizzle RC must not leak into the release docs.
- Better Auth's examples separate installable skills from documentation lookup. This
  repository uses stdio for its docs MCP so no hosted backend or credentials are required.
- Only an explicitly permitted public End Product block can enter the site. Exclude paid
  source and derivatives from public source, reusable packages and public build inputs.

## Steps and validation

- [x] Build and review homepage, versioned guides and filterable API reference.
- [x] Verify the quickstart against a clean install of the published core.
- [x] Show installable skills and test MCP lookup with an SDK stdio client.
- [x] Record registry availability, permission evidence and a migration path.
- [x] Run workspace verification and browser checks at desktop and mobile widths.

## Handoff

The release catalog has 83 public TypeScript export entries across 13 import
paths, 10 guides and one runnable example. The generator verifies the published
archive checksums. It uses a build-only TypeScript 6 alias for the stable
JavaScript compiler API; the workspace compiler stays on TypeScript 7.

The official shadcn CLI retrieved the free Hero 1 from the public and
authenticated registries in a private scratch directory. The returned source
matched. Its site-only adaptation retains attribution, includes no external
assets, and never enters the reusable example components or MCP catalog. The
deployed build does not require the key. See the third-party notices.

A clean npm install ran the quickstart, the skills CLI installed both skills in
a separate Codex project, and the SDK stdio client passed guide, API and example
lookups plus bad ID/version checks. Sandboxed Chromium checked reflow at 320,
375, 768 and 1440 pixels, keyboard focus, search, deep links, and the checkout.
The API remains browsable without JavaScript. A static build scan found no
local registry credential. `pnpm verify` passed 497 tests (237 workspace, six
checkout, 243 engine contract and 11 reference), installed package checks, the
site build and the stdio MCP smoke test.

See the [npm naming assessment](../npm-name-assessment.md). No registry write
was made. The redesign ships through the existing GitHub Pages workflow;
the MCP server runs locally over stdio.
