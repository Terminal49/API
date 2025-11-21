require 'rack'
require 'json'

module Terminal49MCP
  # Rack application for HTTP transport
  # Mounts MCP server at /mcp endpoint
  class HttpApp
    def initialize
      @server = Server.new
    end

    def call(env)
      request = Rack::Request.new(env)

      # Only accept POST requests
      unless request.post?
        return [
          405,
          { 'Content-Type' => 'application/json' },
          [JSON.generate({ error: 'Method not allowed' })]
        ]
      end

      # Parse JSON-RPC request
      begin
        body = request.body.read
        mcp_request = JSON.parse(body)
      rescue JSON::ParserError => e
        return [
          400,
          { 'Content-Type' => 'application/json' },
          [JSON.generate({ error: 'Invalid JSON', details: e.message })]
        ]
      end

      # Get API token from auth middleware
      api_token = env['mcp.api_token']

      # Initialize client with token
      Terminal49MCP.configure do |config|
        config.api_token = api_token
      end

      # Handle MCP request
      response = @server.handle_request(mcp_request)

      [
        200,
        { 'Content-Type' => 'application/json' },
        [JSON.generate(response)]
      ]
    rescue => e
      Terminal49MCP.logger.error("HTTP app error: #{e.message}\n#{e.backtrace.join("\n")}")

      [
        500,
        { 'Content-Type' => 'application/json' },
        [JSON.generate({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: e.message
          },
          id: mcp_request&.dig('id')
        })]
      ]
    end
  end

  # Build Rack app with middleware stack
  def self.build_http_app
    Rack::Builder.new do
      use Middleware::Logging
      use Middleware::Redaction
      use Middleware::Auth
      run HttpApp.new
    end
  end
end
