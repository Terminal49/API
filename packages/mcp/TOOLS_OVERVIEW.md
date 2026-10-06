# MCP tools and resources

The runtime tool schemas returned by `tools/list` define accepted inputs. Tool results contain factual data and metadata. Instructions live in server initialization, tool descriptions, prompts, and guidance resources.

Use the maintained references:

- [Tool and resource reference](../../docs/mcp/home.mdx).
- [Shipment and container filtering](../../docs/mcp/filtering-worklists.mdx).
- [Verified API filter catalog](../../docs/api-docs/api-reference/list-filters.mdx).
- [MCP setup and development](README.md).

For fleet worklists, select common filters or typed `advanced_filters` before fetching detail records. Each list call returns one page capped at 25. Preserve filters and sorting when continuing, and report retrieved rows separately from the total worklist size.
