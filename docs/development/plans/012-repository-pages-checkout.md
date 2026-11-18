# 012 — Repository, documentation, and checkout demo

## Outcome and scope

Rename the existing GitHub repository, organize integration and contributor docs,
and deploy those docs with a reusable React checkout example. Keep the static
example separate from the Fastify host example and all published libraries. Keep
`v0.1.0`, package versions, and npm artifacts unchanged.

## Evidence

- The clean starting worktree tracks `1hubengineering/verify_payment_v1` on `main`.
  GitHub repository ID `1462727143` is public and has no Pages site initially.
- GitHub authenticated as `1hubengineering`; the configured commit email matches
  the account's verified primary email. The existing release tag points to
  `c4464f0f26db808806d4877fc57b0254ba495c38`.
- The existing Fastify example owns authentication, order lookup, admission, and
  idempotency server-side. Its synthetic loopback demo is separate from Pages.
- Shadcnblocks restricts distributing components or derivatives as reusable
  examples/templates. The public end-product exception does not cover this use.
  The ignored local `.env`
  has a registry credential; its value was read with Node's dotenv parser and
  never logged or sent to the registry.

## Steps

- [x] Rename in place, update Git origin, add description and topics, and confirm tag identity.
- [x] Update source metadata and links; document usage, supported integrations,
      customization, project skills, MCP, testing, and publishing.
- [x] Build a private Vite+ example using React, TypeScript, and MIT-licensed
      shadcn/ui primitives. Configure Pages to upload only the static build.
- [x] Exercise receipt states, retry/deduplication, accessible form controls, and
      the checkout subpath. Run `pnpm verify` before committing.
- [ ] Commit and push as `1hubengineering`, confirm Pages works, and set the website.

## Validation

Use synthetic inputs only. Check missing input, pending requests, duplicates,
unavailable providers and retry, mismatch, and receipt match without settlement.
Build and check both Pages entry points at the project base. Verify the output
does not contain the local registry credential. Verify GitHub's repository ID,
release tag, Actions outcome, and the two public URLs after deployment.

## Decisions

The public reusable example uses original checkout composition with official
shadcn/ui primitives, not Shadcnblocks code or assets. Its callback is a host
integration boundary, not an authentication, payment, settlement, or fulfillment
API. Pages has no provider, persistence, or credential dependency.

## Handoff

GitHub confirmed the same repository ID and release tag after the rename, and
accepted the Actions publishing source. `pnpm verify` passed with 237 library,
provider, and app cases, six checkout regression cases, 243 real-engine contract
cases, and 11 frozen reference cases, plus package and static site builds.
Sandboxed Chromium exercised the built project subpath at 320px and 1280px:
keyboard validation/focus, radio selection, pending, unavailable/retry and
match without settlement, with no external requests or horizontal overflow.
The local registry credential was absent from the built files. Drizzle and
shadcn MCP each initialized and listed seven tools. Public deployment still
requires a successful GitHub Actions run.
