# Frozen offline reference

These ten source, test, and synthetic fixture files were copied byte-for-byte
from `reference/unified-payment-cli.zip`, under `unified-payment-cli/`.
Archive SHA-256: `a71dee9c5307a675a34b5b7816caca1eed3a351fcfdcfc949a2c7e16046e0607`.

Run `pnpm run test:reference` to reproduce the original eleven tests. They use Node's
built-in SQLite and test runner; Playwright and live provider access are not needed.
The source is regression evidence and is excluded from library builds, Vitest,
lint, formatting, and strict application type checks. Preserve it unchanged;
new behavior and tests belong in the library packages.

No historical diagnostic helper, real order files, archived dependencies, or
archived lockfile were copied. Reference license/provenance must be reviewed
before redistributing derived provider code in a public release.
