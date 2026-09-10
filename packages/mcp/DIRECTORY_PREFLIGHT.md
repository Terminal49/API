# MCP Directory Preflight

Run this checklist before submitting or resubmitting Terminal49 to the Claude or
ChatGPT directory.

- [ ] Run `npm run test --workspace @terminal49/mcp -- --run`,
      `npm run build --workspace @terminal49/mcp`, and
      `npm run lint --workspace @terminal49/mcp`.
- [ ] Compare the live `tools/list` response with the tool reference in
      `docs/mcp/home.mdx`. Confirm parameter names, required fields, defaults,
      limits, and descriptions match.
- [ ] Inspect successful tool results and server/tool instructions. They must
      not contain `_agent_steering`, `_response_contract`,
      `presentation_guidance`, `suggested_follow_ups`, or `suggested_tools`.
- [ ] Exercise validation, not-found, entitlement, and upstream failure cases.
      Each known failure must identify its cause and next action; do not wrap
      non-retryable failures in a generic retry message.
- [ ] Confirm `track_container.number` is required and `get_container`
      `transport_events` returns only event counts plus the latest event. Use
      `get_container_transport_events` for full history.
- [ ] Run `mcpdemo` against `https://mcp.terminal49.com` using Anthropic's
      current [submission requirements](https://claude.com/docs/connectors/building/submission)
      and [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
      Resolve every failure before resubmitting.
