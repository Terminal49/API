require 'dotenv/load'
require_relative 'lib/terminal49_mcp'
require_relative 'lib/terminal49_mcp/http_app'

# Initialize configuration
Terminal49MCP.configure

# Mount MCP server at /mcp
run Rack::URLMap.new(
  '/mcp' => Terminal49MCP.build_http_app,
  '/' => proc { |env|
    [
      200,
      { 'Content-Type' => 'application/json' },
      [JSON.generate({
        name: 'Terminal49 MCP Server',
        version: Terminal49MCP::VERSION,
        endpoints: {
          mcp: '/mcp'
        },
        documentation: 'https://github.com/Terminal49/API/tree/main/mcp'
      })]
    ]
  }
)
