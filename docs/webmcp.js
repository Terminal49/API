/**
 * WebMCP tool for agents running in the visitor's browser
 * (https://webmachinelearning.github.io/webmcp/).
 *
 * Mintlify already registers search_docs, read_page, navigate_page,
 * get_site_overview, and read_skill on every docs page. This adds the one
 * thing those don't cover: how to connect to the Terminal49 MCP server.
 * The tool name must not collide with Mintlify's, or registration fails.
 *
 * Mintlify loads every .js file in docs/ on every page, so this is plain
 * browser JavaScript with no build step.
 */
(function () {
  var MCP_URL = 'https://mcp.terminal49.com';

  // Older Chrome builds expose the API on navigator instead of document.
  var modelContext = document.modelContext || navigator.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return;

  // Top-level page only, once: Mintlify navigates client-side and may run
  // custom scripts again, and embedded frames would register a duplicate.
  if (window.top !== window || window.__t49WebMcpRegistered) return;
  window.__t49WebMcpRegistered = true;

  var tool = {
    name: 'get_terminal49_mcp_connection',
    title: 'Get Terminal49 MCP server connection details',
    description:
      'Get the URL, transport, and sign-in details for the Terminal49 MCP server, plus setup guides for Claude, ChatGPT, Cursor, VS Code, and other MCP clients. Use this to connect an agent to a Terminal49 account to search, track, and monitor shipments.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () {
      var docs = window.location.origin + '/docs/mcp';
      return Promise.resolve({
        url: MCP_URL,
        transport: 'streamable-http',
        authentication:
          'OAuth 2.1 through auth.terminal49.com, discovered from the protected resource metadata; or send a Terminal49 API key as "Authorization: Token YOUR_API_KEY".',
        protected_resource_metadata: MCP_URL + '/.well-known/oauth-protected-resource',
        docs: docs + '/home',
        setup_guides: {
          claude: docs + '/setup/claude',
          claude_code: docs + '/setup/claude-code',
          chatgpt: docs + '/setup/chatgpt',
          cursor: docs + '/setup/cursor',
          vs_code: docs + '/setup/vs-code',
          microsoft_copilot: docs + '/setup/microsoft-copilot',
          other_clients: docs + '/setup/other-clients',
        },
      });
    },
  };

  // The executor catches a synchronous throw (e.g. InvalidStateError) as well
  // as a rejection, so a failed attempt always clears the flag for a retry.
  new Promise(function (resolve) {
    resolve(modelContext.registerTool(tool));
  }).catch(function (error) {
    window.__t49WebMcpRegistered = false;
    if (window.console && console.warn) console.warn('WebMCP: could not register tool', error);
  });
})();
