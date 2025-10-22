module Terminal49MCP
  module Middleware
    # Logging middleware for request/response tracking
    # Records tool invocations, latency, and status codes
    class Logging
      def initialize(app)
        @app = app
      end

      def call(env)
        start_time = Time.now
        request_id = SecureRandom.uuid

        env['mcp.request_id'] = request_id

        Terminal49MCP.logger.info({
          event: 'mcp.request.start',
          request_id: request_id,
          method: env['REQUEST_METHOD'],
          path: env['PATH_INFO'],
          timestamp: start_time.iso8601
        }.to_json)

        status, headers, body = @app.call(env)

        duration_ms = ((Time.now - start_time) * 1000).round(2)

        Terminal49MCP.logger.info({
          event: 'mcp.request.complete',
          request_id: request_id,
          status: status,
          duration_ms: duration_ms,
          timestamp: Time.now.iso8601
        }.to_json)

        [status, headers, body]
      rescue => e
        duration_ms = ((Time.now - start_time) * 1000).round(2)

        Terminal49MCP.logger.error({
          event: 'mcp.request.error',
          request_id: request_id,
          error: e.class.name,
          message: e.message,
          duration_ms: duration_ms,
          timestamp: Time.now.iso8601
        }.to_json)

        raise
      end
    end
  end
end
