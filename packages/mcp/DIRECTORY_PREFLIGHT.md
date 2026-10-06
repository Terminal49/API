# MCP Directory Preflight

Run this checklist before submitting or resubmitting Terminal49 to the Claude or
ChatGPT directory.

- [ ] Run `npm run test --workspace @terminal49/mcp -- --run`,
      `npm run build --workspace @terminal49/mcp`, and
      `npm run lint --workspace @terminal49/mcp`.
- [ ] Confirm every tool has a non-empty `title`, `readOnlyHint`, and
      `destructiveHint`. Confirm `track_container` is the only write tool and
      no tool is destructive. CI enforces this in
      [`annotations.test.ts`](./src/annotations.test.ts).
- [ ] Confirm tool names remain at most 64 characters, list `page_size` stays
      bounded to 1–25, and the advertised `include` choices/defaults remain
      lean. CI locks these contracts in
      [`protocol-compat.test.ts`](./src/protocol-compat.test.ts).
- [ ] Compare the live `tools/list` response with the tool reference in
      `docs/mcp/home.mdx`. Confirm parameter names, required fields, defaults,
      limits, and descriptions match.
- [ ] Confirm the live connector still uses HTTPS, OAuth, and Streamable HTTP
      at `https://mcp.terminal49.com`. CI checks the locked submission metadata
      and exercises the protocol surface over Streamable HTTP in the annotation
      and protocol-compatibility tests.
- [ ] Confirm the tool surface stays task-specific with no catch-all request
      tool such as `api_request`.
- [ ] Confirm tools and server instructions request only their declared
      parameters—not chat history, conversation context, or user memory. CI
      rejects conversation- or memory-shaped arguments and instructions in
      [`protocol-compat.test.ts`](./src/protocol-compat.test.ts).
- [ ] Inspect successful tool results and server/tool instructions. They must
      not contain `_agent_steering`, `_response_contract`,
      `presentation_guidance`, `suggested_follow_ups`, or `suggested_tools`.
- [ ] Exercise validation, not-found, entitlement, and upstream failure cases.
      Each known failure must identify its cause and next action; do not wrap
      non-retryable failures in a generic retry message.
- [ ] Confirm `track_container.number` is required and `get_container`
      `transport_events` returns only event counts plus the latest event. Use
      `get_container_transport_events` for full history.
- [ ] Recheck the [privacy policy](https://terminal49.com/privacy) and MCP data
      practices: tools access the authenticated private account, use only tool
      arguments, and only `track_container` creates data.
- [ ] Populate and run `mcpdemo` with at least three working prompts. Exercise
      every tool in MCP Inspector and a Claude custom connector; use the
      [live eval](./eval/README.md) as the automated baseline.
- [ ] Review the results against Anthropic's
      current [submission requirements](https://claude.com/docs/connectors/building/submission)
      and [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
      Resolve every failure before resubmitting.
