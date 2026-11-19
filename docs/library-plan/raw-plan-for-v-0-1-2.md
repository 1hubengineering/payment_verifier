**Here is the contract I recommend, followed by one complete instruction you can give your coding agent.** The instruction includes the contract, implementation rules, and acceptance criteria, so the agent will not need to reconstruct our earlier conversations.

I rechecked the current [SDK orchestration](https://github.com/1hubengineering/payment_verifier/blob/main/packages/verifier/src/verifier.ts), [comparison logic](https://github.com/1hubengineering/payment_verifier/blob/main/packages/verifier/src/comparison.ts), and [input parser](https://github.com/1hubengineering/payment_verifier/blob/main/packages/verifier/src/providers/locator.ts). The changes below address the existing result labels, lost provider diagnostics, and missing automatic input detection. **This is the proposed specification; I have not changed repository code.**

## 1. The clean verification response contract

### What a successful result means

The library returns:

```json
{
  "verified": true,
  "status": "VERIFIED",
  "code": "PAYMENT_VERIFIED"
}
```

when it has independently retrieved the official receipt and all required verification checks pass.

That includes checking the provider, successful payment status, recipient, transfer amount, currency, invoice reference, and other required rules against the server’s payment expectation.

We remove `MATCHED_RECEIPT_ONLY`, `settlementStatus: "UNCONFIRMED"`, and the delivery disclaimer from the active public contract.

### Five verification outcomes

| Status          | Exact meaning                                                                                                      | Example code                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `VERIFIED`      | The official receipt was retrieved and all required checks passed.                                                 | `PAYMENT_VERIFIED`                               |
| `MISMATCH`      | At least one required check definitively failed against the official receipt.                                      | `AMOUNT_MISMATCH`                                |
| `NOT_FOUND`     | A recognized provider response confirms that the requested receipt was not found.                                  | `RECEIPT_NOT_FOUND`                              |
| `UNAVAILABLE`   | The library could not obtain sufficient reliable evidence to finish verification.                                  | `PROVIDER_TIMEOUT`, `UNSUPPORTED_RECEIPT_FORMAT` |
| `INVALID_INPUT` | The submitted input could not be accepted or resolved unambiguously to the expected provider’s receipt identifier. | `AMBIGUOUS_INPUT`, `PROVIDER_MISMATCH`           |

`verified` is `true` only when `status` is `VERIFIED`.

For every other status, `verified: false` means **this attempt did not verify the payment**. The accompanying code explains why.

### Give developers the exact facts

Every result should provide:

| Field       | Purpose                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| `status`    | The broad outcome.                                                                        |
| `code`      | The precise, stable machine-readable reason.                                              |
| `stage`     | Where the outcome originated.                                                             |
| `message`   | A factual developer-readable explanation.                                                 |
| `retryable` | Whether an automatic, bounded retry is recommended under the documented rules.            |
| `checks`    | Individual verification checks, including expected and observed values where appropriate. |
| `details`   | Additional structured information, such as HTTP status or timeout duration.               |
| `receipt`   | The normalized information obtained from the official receipt, when available.            |
| `source`    | Retrieval time, parser version, and receipt content hash, when available.                 |

For example, an amount mismatch should identify the amount difference:

```json
{
  "verified": false,
  "status": "MISMATCH",
  "code": "AMOUNT_MISMATCH",
  "stage": "comparison",
  "retryable": false,
  "message": "The transferred amount does not match the expected amount.",
  "checks": [
    {
      "field": "amountMinor",
      "required": true,
      "status": "FAIL",
      "code": "AMOUNT_MISMATCH",
      "rule": "exact",
      "expected": 23000,
      "actual": 20000
    }
  ]
}
```

These are selected fields from the full response. Amounts use integer minor units: `23000` represents ETB 230.00.

A timeout should remain a timeout:

```json
{
  "verified": false,
  "status": "UNAVAILABLE",
  "code": "PROVIDER_TIMEOUT",
  "stage": "receipt_retrieval",
  "retryable": true,
  "message": "The official receipt request exceeded the configured timeout.",
  "checks": [],
  "details": {
    "timeoutMs": 15000
  }
}
```

The developer chooses how to present either result to the buyer.

### Keep operation errors separate

A missing local payment expectation, a duplicate claim, and a failed database commit are different problems from a missing or mismatched bank receipt.

I recommend a typed `VerificationOperationError` for these cases:

| Situation                                                  | Operation error           |
| ---------------------------------------------------------- | ------------------------- |
| Local payment expectation does not exist                   | `EXPECTATION_NOT_FOUND`   |
| Merchant cancelled the expectation                         | `EXPECTATION_CANCELLED`   |
| Expectation expired                                        | `EXPECTATION_EXPIRED`     |
| Same idempotency key used for a different submission       | `IDEMPOTENCY_CONFLICT`    |
| Receipt is already claimed under the existing claim policy | `RECEIPT_ALREADY_CLAIMED` |
| Caller cancelled the SDK operation                         | `OPERATION_CANCELLED`     |
| Persistence failed with a known unsuccessful outcome       | `STORAGE_FAILURE`         |
| Whether the transaction committed is uncertain             | `STORAGE_OUTCOME_UNKNOWN` |

The SDK returns ordinary verification outcomes and rejects with a structured operation error when the operation itself cannot complete.

### Two rules that prevent misleading results

**Preserve all findings.** If the amount is wrong and the invoice reference is missing, return `MISMATCH` and include both checks. A definite failure already prevents verification; the missing field must still be reported.

**Define retry behavior precisely.** A timeout can justify another check. An unsupported receipt layout usually needs an adapter update. Reusing a completed attempt’s idempotency key returns its original result; a fresh verification after a known outcome uses a new attempt. If the previous operation’s completion is uncertain, recover it using the original key first.

---

## 2. Consolidated instruction for your coding agent

Implement the following specification in the existing `1hubengineering/payment_verifier` repository.

This is the authoritative product and API direction for the work described here. It supersedes earlier prototype requirements concerning receipt-only success labels, unconfirmed settlement fields, and preservation of pre-V1 APIs.

We have no external users or subscribers. Breaking changes are authorized before V1. Implement a consistent contract across the SDK, persistence, jobs, CLI, examples, tests, and active documentation.

Complete the implementation and verification. Resolve routine implementation choices using the existing architecture and this specification. Report genuine blockers after completing the independent work that remains possible.

## A. Product behavior and ownership

The intended flow is:

1. The host application supplies trusted payment expectations from its own order, invoice, and merchant configuration.
2. The payment instructions show the selected provider, recipient name, recipient account or wallet number, amount, and invoice/order reference.
3. The buyer transfers money using their banking or wallet application.
4. The buyer submits a transaction/reference number, receipt ID, receipt URL, or full SMS.
5. The library extracts a lookup identifier.
6. The backend constructs the official provider receipt URL from trusted constants and the validated identifier.
7. The backend retrieves the official receipt.
8. The library compares that receipt against the server-owned expectation.
9. Successful completion returns `VERIFIED` with `verified: true`.

Customer input supplies a lookup identifier. Customer-supplied amounts, names, balances, payment statuses, and invoice text are not verification evidence.

The host owns authentication, order management, merchant configuration, customer-facing messages, fulfillment, and business effects. Document those integration responsibilities plainly.

Preserve the library’s existing atomic receipt claims, idempotency protections, tenant isolation, and transaction composition.

Remove these from active public result types, examples, and product guidance:

- `MATCHED_RECEIPT_ONLY`
- `settlementStatus: "UNCONFIRMED"`
- A separate mandatory settlement-confirmation stage
- The statement that a successful library verification does not authorize delivery

Do not introduce another equivalent success disclaimer under different names.

## B. Public verification result contract

Use five verification statuses:

- `VERIFIED`
- `MISMATCH`
- `NOT_FOUND`
- `UNAVAILABLE`
- `INVALID_INPUT`

Use a discriminated union so `verified: true` is possible only for `VERIFIED`.

The following defines the intended public shape. Tighten code-specific details and check-state combinations with TypeScript types and runtime schemas during implementation.

```ts
export type ProviderId = 'telebirr' | 'cbe';

export type InputType = 'identifier' | 'receipt_url' | 'sms';

export type DetectedPaymentInput =
  | {
      provider: 'telebirr';
      inputType: InputType;
      identifierKind: 'transaction_id';
      identifier: string;
    }
  | {
      provider: 'cbe';
      inputType: InputType;
      identifierKind: 'receipt_id';
      identifier: string;
    };

export type InputErrorCode =
  | 'EMPTY_INPUT'
  | 'INPUT_TOO_LONG'
  | 'UNRECOGNIZED_INPUT'
  | 'INVALID_IDENTIFIER'
  | 'AMBIGUOUS_INPUT'
  | 'UNSUPPORTED_RECEIPT_URL';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type InputDetectionResult =
  | {
      ok: true;
      value: DetectedPaymentInput;
    }
  | {
      ok: false;
      error: {
        code: InputErrorCode;
        message: string;
        details: Readonly<Record<string, JsonValue>>;
      };
    };

export type CheckField =
  | 'provider'
  | 'transactionId'
  | 'paymentStatus'
  | 'amountMinor'
  | 'currency'
  | 'recipientName'
  | 'recipientAccount'
  | 'invoiceReference'
  | 'transactionTime'
  | 'paymentType';

export type CheckStatus = 'PASS' | 'FAIL' | 'MISSING' | 'INVALID' | 'AMBIGUOUS' | 'SKIPPED';

export type MismatchCode =
  | 'RECEIPT_PROVIDER_MISMATCH'
  | 'TRANSACTION_ID_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'RECIPIENT_NAME_MISMATCH'
  | 'RECIPIENT_ACCOUNT_MISMATCH'
  | 'INVOICE_REFERENCE_MISMATCH'
  | 'PAYMENT_TIME_OUT_OF_RANGE'
  | 'PAYMENT_TYPE_MISMATCH'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REVERSED'
  | 'PAYMENT_CANCELLED';

export type IncompleteEvidenceCode =
  | 'REQUIRED_FIELD_MISSING'
  | 'INVALID_RECEIPT_FIELD'
  | 'AMBIGUOUS_RECEIPT_FIELD';

export interface VerificationCheck {
  field: CheckField;
  required: boolean;
  status: CheckStatus;

  // Null for PASS. SKIPPED uses CHECK_DISABLED.
  code: MismatchCode | IncompleteEvidenceCode | 'CHECK_DISABLED' | null;

  // A documented rule identifier, such as:
  // exact, normalized_name, account_last4, account_full,
  // successful_status, present_identifier, or time_window.
  rule: string;

  expected?: JsonValue;
  actual?: JsonValue;
}

export type ReceiptPaymentStatus = 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'REVERSED' | 'CANCELLED';

export interface ReceiptSnapshot {
  provider: ProviderId;
  transactionId: string | null;
  paymentStatus: ReceiptPaymentStatus | null;
  amountMinor: number | null;
  currency: string | null;
  recipientName: string | null;
  recipientAccount: {
    representation: 'FULL' | 'MASKED' | 'LAST4';
    value: string;
  } | null;
  invoiceReference: string | null;

  // UTC ISO 8601 timestamp when successfully interpreted.
  transactionAt: string | null;
  paymentType: string | null;
}

export interface OfficialReceiptSource {
  kind: 'OFFICIAL_RECEIPT';
  retrievedAt: string;
  parserVersion: string;
  contentHash: string;
}

export type UnavailableCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_BUSY'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_DNS_ERROR'
  | 'PROVIDER_TLS_ERROR'
  | 'PROVIDER_NETWORK_ERROR'
  | 'DESTINATION_BLOCKED'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'RECEIPT_TOO_LARGE'
  | 'RECEIPT_RENDER_TIMEOUT'
  | 'UNSUPPORTED_RECEIPT_FORMAT'
  | IncompleteEvidenceCode
  | 'MULTIPLE_VERIFICATION_ISSUES';

export interface VerificationResultBase {
  // Null when rejected before a durable attempt is created.
  // Every persisted result has its actual verification ID.
  verificationId: string | null;

  tenantId: string;
  paymentId: string;

  // From the trusted server expectation.
  expectedProvider: ProviderId;

  // Detected customer input; null when detection failed.
  input: DetectedPaymentInput | null;

  message: string;
  checks: readonly VerificationCheck[];
  details: Readonly<Record<string, JsonValue>>;

  receipt: ReceiptSnapshot | null;
  source: OfficialReceiptSource | null;
}

export type VerificationResult =
  | (VerificationResultBase & {
      verificationId: string;
      verified: true;
      status: 'VERIFIED';
      code: 'PAYMENT_VERIFIED';
      stage: 'completion';
      retryable: false;
      input: DetectedPaymentInput;
      receipt: ReceiptSnapshot & {
        transactionId: string;
        paymentStatus: 'SUCCESSFUL';
        amountMinor: number;
        currency: 'ETB';
      };
      source: OfficialReceiptSource;
    })
  | (VerificationResultBase & {
      verified: false;
      status: 'INVALID_INPUT';
      code: InputErrorCode | 'PROVIDER_MISMATCH';
      stage: 'input_parsing' | 'input_validation';
      retryable: false;
      receipt: null;
      source: null;
    })
  | (VerificationResultBase & {
      verified: false;
      status: 'MISMATCH';
      code: MismatchCode | 'MULTIPLE_MISMATCHES';
      stage: 'comparison';
      retryable: boolean;
      receipt: ReceiptSnapshot;
      source: OfficialReceiptSource;
    })
  | (VerificationResultBase & {
      verified: false;
      status: 'NOT_FOUND';
      code: 'RECEIPT_NOT_FOUND';
      stage: 'receipt_retrieval';
      retryable: boolean;
      receipt: null;
      source: null;
    })
  | (VerificationResultBase & {
      verified: false;
      status: 'UNAVAILABLE';
      code: UnavailableCode;
      stage: 'receipt_retrieval' | 'receipt_rendering' | 'receipt_parsing' | 'comparison';
      retryable: boolean;
    });
```

### Contract invariants

Apply these rules in both runtime validation and serialization:

1. `VERIFIED` requires official retrieval and every active required check to pass.
2. A verified result includes the actual official transaction ID, normalized receipt, and source metadata.
3. Never substitute a CBE lookup token for the official bank transaction ID.
4. Missing or uninterpretable receipt values remain `null`; do not fabricate empty strings, zero amounts, or successful statuses.
5. `checks` is the canonical list of field findings. Avoid separate independently maintained arrays that can contradict it.
6. `details` contains additional bounded, code-specific information rather than duplicating the entire checks array.
7. `message` describes the observed event accurately. Consumers branch on `status` and `code`, not message wording.
8. Do not return raw SMS messages, raw receipt HTML, balances, credentials, or stack traces in this public result.
9. The result describes the receipt observed during this verification attempt. An idempotent replay retains the original observation and retrieval timestamp.
10. Keep all public values JSON-serializable. Retain validated integer minor units for money.

For a single failed check, use its precise mismatch code. For multiple failed checks, use `MULTIPLE_MISMATCHES` and preserve every finding.

For a single incomplete-evidence issue, use its precise code. For several, use `MULTIPLE_VERIFICATION_ISSUES` and preserve the individual checks.

## C. Outcome selection and exact diagnostics

### Comparison precedence

After obtaining usable official receipt evidence:

1. If any required check definitively fails, return `MISMATCH`.
2. Otherwise, if required evidence is missing, invalid, or ambiguous, return `UNAVAILABLE`.
3. Otherwise, all required checks pass and successful completion may return `VERIFIED`.

Retain every check regardless of the primary status.

Example: a wrong amount and a missing invoice reference produce:

- Primary status: `MISMATCH`
- Primary code: `AMOUNT_MISMATCH`
- Amount check: `FAIL`
- Invoice reference check: `MISSING`

Do not hide the missing reference or replace the known amount mismatch with a generic error.

### Required rules

Preserve the existing required policy unless this specification explicitly changes it. Evaluate:

- Provider and receipt/transaction identity
- Successful payment status
- Transfer amount and currency
- Recipient name and account under the supported matching policy
- Invoice/order reference
- Payment time window
- Supported payment type where applicable

The amount is the transferred principal. Sender service fees and taxes must not become part of the expected transfer amount.

Invoice/reference remains required under the current payment policy. Missing evidence must not silently disable that requirement. Any deliberately supported alternative must be an explicit host configuration with documented behavior.

Every active verification rule is required for that configured policy. A deliberately disabled rule is `SKIPPED`, with `required: false` and `CHECK_DISABLED`.

When an official receipt exposes only a masked account or suffix, record the actual comparison rule. An account-suffix check must not be described as matching the full account number.

### Payment statuses

Use these exact distinctions:

| Official payment status    | Verification result                                         |
| -------------------------- | ----------------------------------------------------------- |
| `SUCCESSFUL`               | Eligible for `VERIFIED` when all other required checks pass |
| `PENDING`                  | `MISMATCH` / `PAYMENT_PENDING`                              |
| `FAILED`                   | `MISMATCH` / `PAYMENT_FAILED`                               |
| `REVERSED`                 | `MISMATCH` / `PAYMENT_REVERSED`                             |
| `CANCELLED`                | `MISMATCH` / `PAYMENT_CANCELLED`                            |
| Missing or uninterpretable | `UNAVAILABLE` with the precise evidence issue               |

Here, `MISMATCH` means a required rule failed at the time of checking. It does not establish fraudulent intent.

### Retrieval and parsing failures

Preserve known causes through transport, provider adapters, SDK orchestration, persistence, jobs, and framework adapters.

Examples:

- HTTP request timeout → `PROVIDER_TIMEOUT`
- Known rate limit → `PROVIDER_RATE_LIMITED`
- Local provider concurrency exhaustion → `PROVIDER_BUSY`
- Known DNS failure → `PROVIDER_DNS_ERROR`
- Known TLS failure → `PROVIDER_TLS_ERROR`
- Other known connection failure → `PROVIDER_NETWORK_ERROR`
- Rendering deadline exceeded → `RECEIPT_RENDER_TIMEOUT`
- Unrecognized official receipt layout → `UNSUPPORTED_RECEIPT_FORMAT`

Use a specific cause only when it is known. Preserve a safe underlying transport error code in `details` where useful.

Distinguish an invalid response received from the provider from an invalid return value produced by our own adapter. The latter is an operation/integration error.

For HTTP failures, retain the observed status in `details.httpStatus`.

Only a recognized provider-specific absence response becomes `NOT_FOUND` / `RECEIPT_NOT_FOUND`. An unexplained HTTP 404 remains a retrieval failure, such as `UNAVAILABLE` / `PROVIDER_HTTP_ERROR`, with `httpStatus: 404`.

Distinguish stages accurately:

- Customer-input interpretation: `input_parsing`
- Input/provider validation: `input_validation`
- Official HTTP retrieval: `receipt_retrieval`
- Browser rendering: `receipt_rendering`
- Official receipt interpretation: `receipt_parsing`
- Required-field and value evaluation: `comparison`
- Successful operation completion: `completion`

## D. Operation errors and job states

Keep `submit()` returning `Promise<VerificationResult>` for ordinary verification outcomes.

Reject with a typed `VerificationOperationError` when the request, stored workflow, configuration, or persistence prevents the operation from completing.

The error must expose:

```ts
interface SerializedVerificationOperationError {
  type: 'VERIFICATION_OPERATION_ERROR';
  code: string;
  stage: string;
  message: string;
  retryable: boolean;
  details: Readonly<Record<string, JsonValue>>;
}
```

Implement closed code and stage unions for the supported cases. Include accurate equivalents of:

- `INVALID_REQUEST`
- `INVALID_EXPECTATION`
- `EXPECTATION_NOT_FOUND`
- `EXPECTATION_CONFLICT`
- `EXPECTATION_CANCELLED`
- `EXPECTATION_EXPIRED`
- `EXPECTATION_NOT_YET_VALID`
- `EXPECTATION_CHANGED`
- `IDEMPOTENCY_CONFLICT`
- `RECEIPT_ALREADY_CLAIMED`
- `PROVIDER_NOT_CONFIGURED`
- `INVALID_ADAPTER_RESULT`
- `INVALID_PREPARATION`
- `OPERATION_CANCELLED`
- `STORAGE_FAILURE`
- `STORAGE_OUTCOME_UNKNOWN`
- `CORRUPT_STATE`
- `INTERNAL_ERROR`

Preserve underlying exceptions through a server-side `cause`. Serialize only safe structured diagnostics.

Do not misclassify these errors as receipt absence, receipt mismatch, or provider downtime.

Keep these distinct:

- Merchant expectation cancelled
- Bank payment cancelled
- Caller cancelled the SDK operation

Job lifecycle and verification outcome are separate:

- A queued or running job has no completed verification result.
- A completed job can contain `VERIFIED`, `MISMATCH`, `NOT_FOUND`, `UNAVAILABLE`, or `INVALID_INPUT`.
- An operation failure retains the structured operation error.

HTTP response mapping belongs to framework adapters. Customer-facing wording belongs to the integrating application.

## E. Retry and idempotency semantics

Define `retryable` as:

> The SDK recommends a fresh, bounded attempt because it may produce a useful different outcome without first correcting the submitted identifier, trusted expectation, or implementation.

`false` means no automatic retry recommendation. It does not claim the condition can never change.

Apply cause-specific policy:

- Timeouts and known transient failures are normally retryable.
- Rate limits may include a validated, bounded `retryAfterMs`.
- Pending payments may be retryable when the adapter supports a useful later check and no permanent mismatch also exists.
- Wrong amount, recipient, currency, or invoice is not automatically retryable.
- Invalid or ambiguous input requires correction.
- Unsupported layouts and deterministic parser failures are not automatically retryable.
- Confirmed receipt absence is retryable only when supported provider behavior justifies it.
- Unknown causes must not be presented as known transient failures.

Preserve idempotency:

1. Once an idempotency key is bound to a canonical submission, the same key and submission replay the original persisted result.
2. Equivalent identifier, URL, and SMS forms normalize to the same canonical submission identity.
3. The same bound key with a different canonical submission produces `IDEMPOTENCY_CONFLICT`.
4. After a known completed outcome, a deliberate fresh verification uses a new attempt/key, or an explicitly documented existing retry API.
5. After a client timeout or uncertain commit, recover with the original key first.
6. Do not silently perform a new provider fetch when replaying a completed attempt.

Bound retries by the configured attempt budget and expectation lifetime.

## F. Shared automatic input detection

Export a pure, browser-safe function:

```ts
detectPaymentInput(input: string): InputDetectionResult
```

It performs no network request and does not verify a payment.

Support:

| Provider | Input forms                                                   |
| -------- | ------------------------------------------------------------- |
| Telebirr | Bare transaction/reference ID, official receipt URL, full SMS |
| CBE      | Bare `v2-…` receipt ID, official receipt URL, full SMS        |

Implementation rules:

1. Detect the provider independently of the order.
2. Return the input type, identifier kind, and extracted identifier.
3. Preserve CBE opaque receipt ID casing.
4. Apply Telebirr normalization only according to established supported syntax.
5. Accept a standalone CBE `v2-…` token in a message; a complete receipt URL is not required.
6. Recognize supported receipt URLs and extract only their identifier.
7. A standalone unsupported URL produces `UNSUPPORTED_RECEIPT_URL`.
8. In SMS input, ignore unrelated URLs such as feedback links. Do not treat them as receipt evidence or let them block an otherwise valid recognized identifier.
9. Recognize receipt URL candidates by supported provider host/path shapes. Do not mine unrelated URL paths as receipt candidates.
10. Collect all supported identifier candidates. Repeated appearances of the same normalized identifier are acceptable.
11. Different identifiers or mixed provider candidates produce `AMBIGUOUS_INPUT`.
12. Never silently choose the first/last candidate or prefer a URL over a conflicting standalone identifier.
13. Handle surrounding whitespace and punctuation.
14. Handle the supplied Telebirr structural edge case where the URL is immediately followed by `.Thank you…`.
15. Bound input size and parsing work.
16. Do not treat arbitrary alphanumeric words in an SMS as transaction identifiers.
17. Do not confuse the merchant’s invoice reference with the provider transaction ID.
18. Do not infer a production identifier grammar from one example alone.

After detection, the server checks the detected provider against the expectation’s provider. A difference produces:

- `status: "INVALID_INPUT"`
- `code: "PROVIDER_MISMATCH"`
- `stage: "input_validation"`
- Details containing the expected and detected providers

Do not silently change the order’s payment method.

Use synthetic fixtures that preserve the structure of the supplied messages without committing personal names, balances, account details, or real receipt identifiers unnecessarily.

## G. Browser validation, backend validation, and official retrieval

Use the same parsing implementation in both environments.

Browser validation is optional for integrators. It provides immediate format feedback, provider detection, and identifier extraction.

Server validation is mandatory on every submission, including direct API calls. Never trust a client-supplied “validated” flag or detected-provider object.

Only the server:

- Loads the trusted expectation
- Validates the selected provider
- Builds the official receipt URL
- Retrieves the official receipt
- Performs payment verification
- Completes required persistence and claim operations

Construct official URLs from trusted provider constants:

```text
Telebirr:
https://transactioninfo.ethiotelecom.et/receipt/{transactionId}

CBE:
https://mbreciept.cbe.com.et/{receiptId}
```

The CBE receipt ID includes its `v2-` prefix.

Keep identifier extraction and outbound URL validation separate. Broader input support must not weaken transport validation.

Preserve the existing protections for TLS validation, permitted destinations, DNS resolution, redirects, response sizes, timeouts, browser resource limits, and cleanup.

The browser-safe export must not import Node-only modules, database drivers, Varlock initialization, or Playwright.

Keep the pure receipt comparison utility separate from official verification. It may return `MATCH`, `MISMATCH`, or `INCOMPLETE` with checks. Caller-supplied receipt data alone must not make that utility return the SDK’s `VERIFIED` result.

## H. Preserve the successful CBE and Telebirr workflows

Live CBE verification has already been demonstrated using Playwright and Chromium.

Treat this work as checking that the current adapter preserves the successful POC.

Locate the successful POC and compare:

- Navigation and receipt retrieval
- Required JavaScript execution
- Required network resources
- Rendering readiness
- Receipt extraction
- Timeout and cleanup behavior

Resolve meaningful regressions found in that comparison. Preserve established resource and destination restrictions while supporting the proven workflow.

Add regression coverage for the actual differences identified. Use a controlled live smoke test only when necessary to resolve an outstanding behavior.

If the POC source is unavailable, state that exact limitation, complete independent work, and do not claim the comparison occurred.

Preserve proven Telebirr behavior as well.

## I. Persistence and transactional correctness

Preserve these guarantees:

- Expectations come from trusted server data.
- Tenant/payment ownership and scope remain enforced.
- Receipt claims use the official provider transaction identity.
- Different CBE lookup tokens for the same official transaction cannot bypass claim uniqueness.
- Existing atomic relationships between receipt claims, attempt records, expectation state, and outbox events remain intact.
- Concurrent submissions cannot both acquire a prohibited duplicate claim.
- Network retrieval stays outside database transactions that need to remain short.
- Completion rechecks relevant expectation state and detects cancellation, expiration, or changes.

When the SDK owns the transaction, return completed success only after the required transaction commits.

Preserve caller-owned transaction composition. Document that a result produced inside an outer transaction is published externally only after that transaction commits. External effects must follow the correct commit boundary.

Distinguish a known unsuccessful storage operation from an uncertain commit outcome. Do not manufacture a provider failure to represent either.

Update persisted result schemas and codecs consistently. Breaking API changes are authorized; silently erasing retained development data is not. Provide an explicit migration or documented development reset path when necessary.

## J. Update all affected surfaces

Inspect the current branch before editing. Known areas include:

- `packages/verifier/src/providers/locator.ts`
- `packages/verifier/src/providers/https.ts`
- `packages/verifier/src/providers/index.ts`
- `packages/verifier/src/providers/extraction.ts`
- `packages/verifier/src/comparison.ts`
- `packages/verifier/src/verifier.ts`
- `packages/provider-cbe/src/index.ts`
- `packages/provider-cbe/src/render.ts`
- Public package exports and types
- Persisted-attempt and durable-job schemas
- CLI output
- Fastify request handling and response schemas
- Web demo input validation and result presentation
- Tests and fixtures
- Active README, specifications, examples, and agent guidance

Replace duplicated input parsers with the shared implementation.

The web example should support one input accepting all supported formats. Any retained guided tabs must use the same parser and backend rules.

Remove obsolete public fields and compatibility aliases. Maintain one authoritative contract.

Update active product instructions that conflict with this specification. Preserve unrelated permission and validation requirements. Historical release artifacts may remain historical.

Keep the existing repository and architecture:

- Vite+ for repository tooling
- The selected Node runtime setup
- Varlock at application, CLI, and worker bootstrap boundaries
- Typed configuration injected into the library
- Storage adapters supporting the established MySQL, PostgreSQL, and SQLite integrations
- Existing direct SQL, Drizzle, Prisma, and custom-adapter boundaries

Core imports must not load environment files or mutate the host environment.

This work does not require restarting from another starter or rewriting the storage framework.

## K. Acceptance criteria

Add meaningful behavior tests covering:

### Input handling

- All six supported provider/input combinations.
- Bare CBE receipt ID acceptance.
- CBE casing preserved through extraction and URL construction.
- Repeated identical identifiers accepted.
- Conflicting identifiers and mixed providers rejected.
- URL/standalone-ID conflicts detected.
- Whitespace, punctuation, and the Telebirr `.Thank you…` edge case.
- Unrelated SMS feedback links ignored.
- Oversized and malformed input rejected accurately.
- Merchant invoice references not mistaken for transaction identifiers.
- Provider mismatch rejected before retrieval.

### Verification outcomes

- Complete official evidence with every required check passing returns `VERIFIED`.
- Each supported field mismatch reports its exact code and values.
- Multiple failures preserve all checks.
- A definite mismatch plus missing evidence preserves both findings.
- Missing required invoice/reference never verifies.
- Disabled checks are `SKIPPED`, never fabricated `PASS`.
- Pending, failed, reversed, and cancelled payments remain distinguishable.
- Pure detection and offline comparison cannot produce official verification success.

### Failure diagnostics

- Timeout remains a timeout through every layer.
- HTTP status survives serialization.
- Provider-confirmed absence differs from an unexplained HTTP 404.
- Unsupported receipt format differs from invalid customer input.
- Rendering timeout differs from request timeout.
- Missing local expectation differs from missing provider receipt.
- Cancellation and storage failures remain operation errors.
- Known causes are not discarded by generic catch blocks.

### Trust and integration

- Changing SMS amounts, names, balances, or invoice text cannot change official verification evidence or the trusted expectation.
- Direct API calls receive full server validation.
- User-provided URLs are never used as arbitrary outbound destinations.
- Browser exports contain no server-only dependency leakage.
- SDK, persisted results, jobs, CLI, and examples use the same contract.
- Equivalent supported input forms preserve idempotency.
- Concurrent claims preserve existing uniqueness and atomicity.
- Original-key recovery works after uncertain completion.
- Caller-owned transaction composition remains supported.
- CBE behavior preserves the successful POC where its source is available.

Run the repository’s relevant type checks, builds, focused tests, and required existing gates. Run storage adapter conformance tests where serialization, persistence, or transaction behavior is affected.

Do not describe mocked/offline tests as live provider verification.

## L. Completion report

When finished, report:

1. The implemented public API and result contract.
2. The main changes and their purpose.
3. Commands actually run and their results.
4. CBE POC comparison findings and any live checks actually performed.
5. Any remaining limitations or precise blockers.
6. Required development-data migration or reset instructions, if applicable.

Do not publish packages or create a public release as part of this task.
