---
name: payment-verifier-troubleshoot
description: Diagnose Payment Verifier receipt outcomes, unavailable providers, idempotency, migration errors, and transaction conflicts without live bank probes.
---

# Troubleshoot Payment Verifier

Start with the installed versions, the engine/client, and the outcome class.
Do not ask for real receipt links, account data, secrets, or unredacted logs.

- Wrong peer or missing export: check the [release API](https://1hubengineering.github.io/payment_verifier/api/)
  and [storage matrix](https://1hubengineering.github.io/payment_verifier/docs/#storage).
  For Prisma, check that the receipt model exists in the generated client.
  For SQLite, verify the exact native runtime and keep different engines in separate processes.
- `UNABLE_TO_VERIFY`: check locator format, fixture layout and deadline. For CBE,
  check the matching Chromium install and OS sandbox. Do not work around sandboxing.
  `MISMATCHED` means complete evidence disagreed with the order.
- Lost response: reuse the original key for the same request. For a committed
  unavailable result, use a fresh key for a deliberate later attempt.
- Storage conflict: verify the actual transaction and isolation level. Retry the
  entire host transaction within a bounded policy. Keep provider calls outside it.

Consult [outcomes](https://1hubengineering.github.io/payment_verifier/docs/#configuration)
and [retries](https://1hubengineering.github.io/payment_verifier/docs/#retries).
If MCP is connected, search the exact status or factory with `search_docs` and
retrieve its source link with `get_doc`. Confirm any fix with a local reproduction.
