# Documentation

Read the active library documents in this order:

1. [Initialization direction](library-plan/init-plan.md): requested tooling, package boundaries, and compatibility targets.
2. [Product direction](library-plan/library-plan.md): embedding verification in an existing application.
3. [Workspace audit](development/workspace-audit.md): reproduced behavior and migration risks.
4. [Development workflow](development/workflow.md): commands, Codex handoffs, and review process.
5. [Roadmap](development/roadmap.md): implemented slices and the next acceptance gates.
6. [Workspace conventions](development/conventions.md): current package names, runtime policy, commands, and verified sources.

[Durable jobs](development/durable-jobs.md) documents optional queue policy,
encryption, leases and maintenance ownership.

[Checkout example](../examples/fastify-checkout/README.md) demonstrates host
auth/order integration while keeping settlement and fulfillment independent.

[Execution plans](development/plans/) record substantial implementation work.

## Historical standalone material

The earlier [master plan](archive/standalone-plan/ETHIOPIAN_PAYMENT_RECEIPT_VERIFICATION_MASTER_PLAN.md)
and [independent-agent handoff](archive/standalone-plan/INDEPENDENT_AI_AGENT_HANDOFF.md)
are archived without content changes. They remain evidence and a source of
financial/security requirements. Their standalone API/worker roadmap does not
replace the active embedded-library direction.
