# CLI configuration boundary

`pnpm check:env` validates this application's Varlock schema using a non-secret
default. The verification CLI will be implemented after the core and storage
contracts. There is no verification command yet.

Keep deployment configuration here. Merchant accounts and payment expectations
belong to trusted host records. Never import Varlock from `packages/receipt-verifier`.
Generated environment types stay local to this application.
