# Documentation

Start with the [integration guide](guide.md) for installation, configuration,
supported integrations, checkout customization, testing, and deployment.
Try the [synthetic checkout](https://1hubengineering.github.io/payment_verifier/demo/)
or review [skills and MCP setup](development/skills-and-mcp.md) for contributor tools.

## Maintainer References

Read the active library documents in this order:

1. [Initialization direction](library-plan/init-plan.md): requested tooling, package boundaries, and compatibility targets.
2. [Product direction](library-plan/library-plan.md): embedding verification in an existing application.
3. [Workspace audit](development/workspace-audit.md): reproduced behavior and migration risks.
4. [Development workflow](development/workflow.md): commands, Codex handoffs, and review process.
5. [Roadmap](development/roadmap.md): implemented slices and the next acceptance gates.
6. [Workspace conventions](development/conventions.md): current package names, runtime policy, commands, and verified sources.

[Durable jobs](development/durable-jobs.md) documents optional queue policy,
encryption, leases and maintenance ownership.

The [React checkout](../examples/checkout-web/README.md) shows the browser API.
The [Fastify checkout](../examples/fastify-checkout/README.md) demonstrates host
authentication and order lookup while keeping settlement and fulfillment independent.

[Compatibility](development/compatibility.md), [migrations](development/migrations.md),
[release policy](development/release-policy.md),
[0.1.0 release evidence](development/releases/0.1.0.md), and
[third-party notices](../THIRD_PARTY_NOTICES.md) define release boundaries.

[Execution plans](development/plans/) record substantial implementation work.

## Historical standalone material

The earlier [master plan](archive/standalone-plan/ETHIOPIAN_PAYMENT_RECEIPT_VERIFICATION_MASTER_PLAN.md)
and [independent-agent handoff](archive/standalone-plan/INDEPENDENT_AI_AGENT_HANDOFF.md)
are archived without content changes. They remain evidence and a source of
financial/security requirements. Their standalone API/worker roadmap does not
replace the active embedded-library direction.
