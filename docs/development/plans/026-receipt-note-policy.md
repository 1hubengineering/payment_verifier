# Exact receipt note policy

## Outcome and evidence

Telebirr Customer Note and CBE Reason / Type of service use the same exact
comparison rule. The previous source required mixed letters and digits with
different minimum lengths. Accept the developer's text up to 255 characters.
Require a nonblank reference by default. With explicit `referenceRequired:
false`, allow an empty expected reference and compare it with an empty receipt
note. A nonempty receipt note still fails against an empty expectation.

## Steps and validation

- [x] Replace the token rules in the shared comparison path and keep the opt-in
      in the immutable order and durable verification paths.
- [x] Preserve note text when extracting current Telebirr and CBE receipts.
      Support the same configuration in the local playground.
- [x] Test the normal registration, comparison, claim and replay path with
      synthetic data. Run `pnpm verify` and restart the local portal.

## Decisions

Treat absent and empty receipt notes as blank. A conflicting or invalid note
still fails the check. Existing expectations remain required when the policy is
absent. The stored shape for default expectations stays compatible with existing
records. The reference remains independent of the provider transaction number.
Older SDK builds still apply their original reference validation when reading
records. Keep an updated build for orders that use the new reference rules.

## Validation

Synthetic tests passed for both providers through registration, exact comparison,
claim and replay. The browser confirmed free-text entry, the required default,
and the blank-note toggle. The local portal was rebuilt and restarted with its
existing state. `pnpm verify` passed with one Vitest worker, covering 363 workspace
tests, 40 checkout tests, 297 adapter contracts, 11 frozen reference tests,
installed packages and the documentation smoke check.
