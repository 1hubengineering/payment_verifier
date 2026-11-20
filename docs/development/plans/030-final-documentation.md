# Payment Verifier integration documentation

## Outcome and scope

Implement the [final documentation plan](../../library-plan/payment-verifier-final-documentation-plan.md)
for the published SDK, with executable examples, task-based navigation, and local
validation. Changes cover documentation, its build, and its examples.

## Evidence

All five npm `latest` tags resolve to `0.3.0`. The local branch adds a deployment
CLI diagnostic after the release tag. A source diff shows no intervening changes
in the five SDK packages. The published declarations, rather than that source
comparison, define the API reference. The existing retry guide contradicts the
release's bound-key behavior. The existing site generates the latest API index
from workspace builds and only includes the original guides.

## Steps

- [x] Confirm the baseline and audit repository and documentation tooling.
- [x] Align the README, developer site, quickstart, and installed examples.
- [x] Document evidence, results, recovery, persistence, security and operations.
- [x] Build a release-artifact API index, verify cross-links, and run checks.
- [x] Run the independent exercise, reconcile findings and write the report.

## Validation

Run the examples in an isolated npm consumer, the full workspace verification
suite with disposable stores, a generated-site link check, and an independent
documentation-only exercise. Record actual results and remaining gaps.

## Decisions

Use a local SQLite checkout with an injected synthetic provider to exercise the
same public workflow as a deployed backend. Show production provider wiring
separately. Keep 0.1.0 through 0.2.0 guide bodies intact.

## Handoff

The [validation report](../reports/0.3.0-documentation-validation.md) records
the installed examples, local checks, independent exercise and remaining gaps.
The revised Pages site awaits deployment and a post-deploy check.
