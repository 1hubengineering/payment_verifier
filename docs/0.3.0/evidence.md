A receipt submission supplies a lookup identifier. Load the amount, merchant
account, provider, receipt note and validity window from the authorized
server-side order. Screenshots, SMS claims of success, and browser responses
carry no authority to mark an order paid.

| Provider | Identifier                                                                                                       | Official URL shape                                           | Synthetic SMS example                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Telebirr | 6–32 ASCII letters or digits. Canonicalized to uppercase.                                                        | `https://transactioninfo.ethiotelecom.et/receipt/DEMOABC123` | `Transaction ID: DEMOABC123` or a message containing the official receipt link                        |
| CBE      | `v2-` and 1–512 ASCII letters, digits, underscores or hyphens. Preserve case, including the prefix as submitted. | `https://mbreciept.cbe.com.et/v2-DeMo_A1`                    | `Receipt: https://mbreciept.cbe.com.et/v2-DeMo_A1` or a message containing a recognizable `v2-` token |

The examples illustrate syntax only. Keep all synthetic locators offline.
`detectPaymentInput` from `@1hubengineering/verifier/input` recognizes these
formats without I/O. Inputs are limited to 4,096 characters. Conflicting
locators fail as ambiguous. A standalone URL must match the official HTTPS host
and path, without a query, fragment, credentials or custom port. The backend
repeats recognition, enforces the expectation's provider and builds the lookup
URL from a fixed endpoint and the canonical identifier. The configured adapter
retrieves it using its transport policy. [Security and privacy](security.md)

The application order maps to `paymentId`. The merchant's intended receipt
text maps to `reference`. Set it to the invoice number only when that number is
entered as Telebirr **Customer Note** or CBE **Reason / Type of service**. The
provider transaction ID identifies the transfer at the provider. Telebirr
compares the lookup ID to the official transaction ID. For CBE, the case-sensitive
lookup token locates the receipt and the transaction ID extracted from that
receipt is used for the claim.

The recipient check compares a normalized name and the last four digits of the
account. A matching name and suffix cannot distinguish two accounts with those
same values. A recognized identifier only means a lookup is possible. A pure
comparison can report `MATCH`. Backend `VERIFIED` requires provider retrieval,
all required checks, and claim persistence. [Result guarantees](configuration.md)
