module Terminal49MCP
  module Middleware
    # Auth middleware for HTTP transport
    # Validates Bearer token or MCP client authentication
    class Auth
      BEARER_PATTERN = /^Bearer\s+(.+)$/i.freeze

      def initialize(app)
        @app = app
      end

      def call(env)
        # Extract token from Authorization header
        auth_header = env['HTTP_AUTHORIZATION']

        if auth_header.nil? || auth_header.empty?
          return unauthorized_response('Missing Authorization header')
        end

        match = auth_header.match(BEARER_PATTERN)
        if match.nil?
          return unauthorized_response('Invalid Authorization header format. Expected: Bearer <token>')
        end

        token = match[1]

        # Store token in env for downstream use
        env['mcp.api_token'] = token

        @app.call(env)
      rescue => e
        Terminal49MCP.logger.error("Auth middleware error: #{e.message}")
        unauthorized_response('Authentication failed')
      end

      private

      def unauthorized_response(message)
        [
          401,
          { 'Content-Type' => 'application/json' },
          [JSON.generate({ error: message, code: 'unauthorized' })]
        ]
      end
    end
  end
end
