# Telebirr receipt retrieval through SSH

## Outcome and scope

The private VPS portal can use a workstation on Ethio telecom for Telebirr
receipt lookups. Keep the existing SDK verification and HTTPS checks. Only
the portal receives the private socket. Keep direct retrieval as the default
for local installs and leave CBE, Bingo and host routing alone.

## Evidence

The VPS received Telebirr timeouts with 15- and 30-second deadlines. The user
could open the same receipt from Ethio telecom in a browser. SDK retrieval from
that network still needs verification. The existing VPS SSH server permits Unix
socket forwarding and the AndHub container runs as UID and GID 1001.

## Steps and validation

- [x] Add a Telebirr-only Unix socket option and preserve HTTPS hostname and
      certificate verification, input validation, deadlines and byte limits.
- [x] Add tests for the official hostname, non-Telebirr rejection and missing
      socket handling. Check TLS and socket forwarding using synthetic evidence.
- [x] Wire the option through Varlock and an isolated Compose override. Document
      starting, reconnecting and rolling back the tunnel from WSL.
- [x] Support nested tables, omitted row and cell ends, and fee rows found in
      the official Telebirr receipt. Preserve duplicate invoice detection and
      the required independent order reference.
- [x] Deploy only the AndHub portal and check HTTPS, the offline outcome, and
      Bingo container identity. Attempt the existing authorized receipt only
      if the workstation can connect to Telebirr.
- [x] Run `pnpm verify` and record the results and remaining live work.

## Decisions

Use a fixed reverse SSH forward to the official receipt hostname and port. The
container opens a read-only mounted Unix socket and negotiates TLS itself.
This keeps receipt data encrypted to Telebirr, avoids a listening TCP proxy and
requires no VPS routing or SSH daemon changes.

The first VPS build reached the authorized receipt through the workstation in
2.35 seconds, then failed at parsing. A private in-memory comparison reproduced
the table and fee patterns with the real layout. Synthetic regression cases
cover those patterns and a second conflicting invoice after fee rows. The live
sample includes the provider's invoice number but lacks a merchant order
reference. The SDK still requires the merchant reference for verification.

## Handoff

VPS commit `2d49b60` retrieved and compared the authorized receipt in 3.52
seconds. The workstation tunnel ran as a transient WSL user service. The
stopped and reconnected states, HTTPS health and sibling container isolation
passed. `pnpm verify` passed from the exact deployed commit. See the
[VPS report](../reports/v0.2.0-vps-validation.md#telebirr-workstation-tunnel)
for the outcome and rollback procedure.
