# Execution plans

Use a Markdown plan in `docs/development/plans/` for multi-package work, public API
changes, persistence, provider retrieval, or security-sensitive behavior. Small,
local fixes can proceed directly. Plans remain readable without chat history.

Include:

1. **Outcome and scope:** the user-visible behavior, boundaries, and related requirements.
2. **Evidence:** current source, fixtures, reproduction results, and unresolved assumptions.
3. **Steps:** concrete slices with checkboxes; identify touched packages and dependencies.
4. **Validation:** commands and observable acceptance criteria, including failure paths.
5. **Decisions:** tradeoffs and material discoveries made while implementing.
6. **Handoff:** actual results, limitations, and the next uncompleted step.

Keep the plan current as evidence changes. Do not declare a feature complete until
its acceptance criteria pass. Database/ORM support requires the shared contract
suite against real selected engine and client versions. Publishing, external
deployment, and provider traffic require the authorization appropriate to that task;
creating a local plan does not introduce an extra approval step.
