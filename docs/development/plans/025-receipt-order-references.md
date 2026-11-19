# Receipt order references in the local playground

The [exact note policy](026-receipt-note-policy.md) supersedes this plan's
provider-specific length rules.

## Outcome and evidence

Read Telebirr's `Customer Note` in the current receipt table. Accept the
seven-character format observed in CBE's `Reason / Type of service` as a
trusted expectation. A local Telebirr attempt recorded `MISSING` for the
reference. The CBE form rejected a seven-character reference before lookup.

## Steps and validation

- [x] Reproduce the Telebirr note layout and verify that the parser preserves
      exact reference matching and conflicting note detection.
- [x] Update the CBE reference length check and add provider-specific guidance
      in the playground. Test short references through the SDK and portal.
- [x] Rebuild and restart only the local portal using its existing data.
      Run `pnpm verify` and record the live validation limits.

## Decision

Keep the reference a required, exact match to the trusted order. Preserve the
existing letter and digit requirements and the Telebirr minimum length. The
provider's transaction number and the VAT invoice number remain separate from
the merchant reference. Use synthetic values in committed fixtures.

The allowance is limited to CBE. Older SDK builds still reject expectations
created with seven-character CBE references when opening those records.

## Validation evidence

The updated Telebirr adapter read the authorized receipt directly from the
workstation and matched the order reference supplied for the check. No claim
was created. The CBE evidence was a pasted receipt, so the current CBE case
uses synthetic provider and portal fixtures for validation.

The rebuilt local portal served both receipt labels after restarting with its
existing state. `pnpm verify` passed with one Vitest worker on fresh disposable
fixtures. The run covered 358 workspace tests, 40 checkout tests, 297 storage
contract tests, 11 frozen reference tests, installed packages, and the docs
build and smoke check.
