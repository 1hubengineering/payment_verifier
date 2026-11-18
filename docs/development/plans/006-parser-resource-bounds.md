# Bound unsupported provider HTML

This slice is complete and included in [0.1.0](../releases/0.1.0.md). The acceptance
counts and next steps below record its original handoff; see the
[roadmap](../roadmap.md) for current scope.

## Outcome and scope

Malformed maximum-size HTML must fail closed with bounded parser work. Preserve
supported synthetic layouts and ambiguity rules; prove browser deadline cleanup
when an inline script never yields. No provider traffic or new runtime dependency.

## Evidence

Before this slice, isolated Node children parsing 2 MB of repeated unclosed
script, tr and span opening tags each exceeded a three-second deadline and were
killed. The unanchored extraction regexes repeatedly rescanned suffixes; header
processing also copied every remaining row. Download byte limits alone did not
bound this work. Existing extraction tests cover 47 cases; CBE has seven real
Chromium cases with mocked HTTPS.

## Steps

- [x] Replace whole-document structural regex extraction with a linear scanner.
- [x] Bound tag count/size and structural text; reject unsupported structures.
- [x] Preserve existing extraction and conflicting-evidence behavior.
- [x] Add adversarial maximum-size regressions and infinite-script recovery.
- [x] Run pnpm verify, review, update roadmap and commit.

## Validation

Existing synthetic parsing cases must remain valid. Maximum-size repeated
unclosed tags, excessive tags, malformed quoted attributes, nested structural
ambiguity and hidden script/comment content cannot create receipt matches.
A real Chromium infinite loop must return TIMEOUT and release capacity for the
next valid synthetic request. Full nine-cell storage contract and installed
consumers remain required by pnpm verify; frozen reference files stay unchanged.

## Decisions

Use a small scanner for explicitly supported layouts, not browser HTML repair.
Unsupported structures fail closed. No dependency is needed for this boundary.
Tag scanning and raw-text skipping advance monotonically; tag/text limits cap
intermediate arrays and label comparison. Text entities are decoded only after
structural recognition, so escaped markup is never interpreted as tags.

## Handoff

The malformed-input reproduction now fails closed in 0.105–0.121 seconds per
child including Node startup (three samples; not a throughput benchmark).
Structural work advances monotonically; bounds are regression-tested without
fragile timing assertions. Real Chromium infinite-loop timeout closes its
browser and admits a following valid receipt. Full acceptance is recorded below.

The scanner also fixes a review finding in entity handling: sequential decoding
previously interpreted `&amp;#65;` twice. Decode each entity exactly once and
prove double-encoded or escaped-markup references cannot match a plain reference.
ASCII-only folding preserves offsets for Unicode characters such as İ. Provider
parser failures now report PROVIDER_UNAVAILABLE rather than INVALID_LOCATOR.
Acceptance: `pnpm verify` passed on Node 26.13.1 with 211 fast/provider tests,
135 real-engine contract cases, 11 frozen reference tests, all builds/types,
publint and installed consumers. Review against code-review.md found no change
to matching/settlement/claim semantics. Unsupported structural layouts now fail
closed instead of being browser-repaired. No live provider availability is claimed.
The next slice implements durable jobs and runnable CLI/worker boundaries.
