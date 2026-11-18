# Operator CLI and optional worker process

This slice is complete and included in [0.1.0](../releases/0.1.0.md). The acceptance
counts and next steps below record its original handoff; see the
[roadmap](../roadmap.md) for current scope.

## Outcome and scope

Provide private runnable applications using Varlock at startup and the proven
verifier/jobs APIs. The operator CLI can register trusted snapshots, compare
saved HTML diagnostically, submit configured verification, enqueue jobs, inspect
scoped status and cancel expectations. The worker processes the same SQLite file
with bounded sequential execution and graceful cancellation. Library users retain
all nine adapter choices; these small operator apps intentionally select SQLite.

## Evidence

The durable API passed 234 shared cases across nine cells, including SIGKILL
recovery, retry rollback and stale-owner fencing. The current CLI package contains
only its Varlock schema. Schema timeout allowed 120000 ms although provider
transport permits at most 60000; align the application boundary with that limit.
Official Varlock 1.25.0 load/run and local code-generation documentation confirms
app-local startup validation; Node's supported runtimes execute these private
TypeScript entry points directly. No new framework dependency is needed here.

## Steps

- [x] Implement trusted operator commands and bounded file input.
- [x] Keep diagnostic saved HTML separate from every storage/claim path.
- [x] Add explicit SQLite lifecycle, optional configured providers and queue key.
- [x] Implement once/loop worker, graceful signal abort and safe error reporting.
- [x] Test actual entry points offline, durable process handoff and restart.
- [x] Update commands/docs/roadmap; pnpm verify, review and commit.

## Validation

Help and diagnostic commands must not create a database or launch provider work.
Saved HTML comparison can never claim or enqueue. CLI inputs are files rather
than receipt/secret command arguments, errors are generic, and all read sizes are
bounded. Required queue key is supplied explicitly, with no default secret.
Provider traffic defaults disabled; routine tests and examples stay offline.
Worker startup validates its own schema, uses the same queue policy/key/database
as admission, leaves acknowledged jobs durable and closes only its owned handle.
Prove process handoff, structured unverified results and shutdown behavior, then
run full verify and installed consumers. Preserve all frozen files.

## Decisions

- These executables are trusted local operator tools, not public authentication
  layers. Embedded hosts still own authentication, order authority and settlement.
- SQLite WAL and busy timeout apply only to handles these apps explicitly open.
  The underlying library never owns a caller connection.
- Reuse the CLI's private runtime factory from the worker rather than add a public
  package just for process configuration. Both applications own local schemas.
- Disable provider traffic by default. Explicit operator opt-in enables bounded
  Telebirr retrieval; browser execution additionally requires its own opt-in and
  matching Chromium. No live request is part of validation.
- Sources: https://varlock.dev/reference/cli/load-and-run/,
  https://varlock.dev/guides/code-generation/, https://varlock.dev/guides/schema/.

## Handoff

Six focused operator tests passed, including actual Varlock CLI-to-worker process
handoff, no-provider unverified outcomes, input byte limits, no saved-HTML storage,
required queue key, cancellation with durable restart and an actual idle worker
SIGTERM/clean exit. `pnpm cli help` also passed through the documented root task.
The durable predecessor d48e216 passed hosted Node 24/26 CI. `pnpm verify` passed on Node 26.13.1: 217 fast/application/provider tests,
234 real-engine contract cases, 11 frozen tests, all builds/types/lint/publint
and installed consumers. Review against code-review.md confirmed no saved-HTML
claim path, no default secret or provider traffic, bounded reads, generic errors
and owned-handle cleanup. Hosted Node 24/26 acceptance is pending for this commit;
checkout and release readiness follow.
