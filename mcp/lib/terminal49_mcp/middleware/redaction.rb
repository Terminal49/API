module Terminal49MCP
  module Middleware
    # Redaction middleware for PII/token protection
    # Prevents API tokens and sensitive data from appearing in logs
    class Redaction
      REDACTED = '[REDACTED]'.freeze

      # Patterns to redact
      TOKEN_PATTERN = /Token\s+[A-Za-z0-9_-]{20,}/i.freeze
      BEARER_PATTERN = /Bearer\s+[A-Za-z0-9_-]{20,}/i.freeze
      API_KEY_PATTERN = /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i.freeze

      # Fields to redact in JSON
      SENSITIVE_FIELDS = %w[
        api_token
        api_key
        token
        password
        secret
        authorization
      ].freeze

      class << self
        # Redact sensitive data from strings
        def redact_string(str)
          return str unless Terminal49MCP.configuration.redact_logs

          str = str.dup
          str.gsub!(TOKEN_PATTERN, "Token #{REDACTED}")
          str.gsub!(BEARER_PATTERN, "Bearer #{REDACTED}")
          str.gsub!(API_KEY_PATTERN, "api_key=#{REDACTED}")
          str
        end

        # Redact sensitive fields from hashes
        def redact_hash(hash)
          return hash unless Terminal49MCP.configuration.redact_logs

          hash.each_with_object({}) do |(key, value), redacted|
            redacted[key] = if SENSITIVE_FIELDS.include?(key.to_s.downcase)
                              REDACTED
                            elsif value.is_a?(Hash)
                              redact_hash(value)
                            elsif value.is_a?(String)
                              redact_string(value)
                            else
                              value
                            end
          end
        end
      end

      def initialize(app)
        @app = app
      end

      def call(env)
        # Redact auth header in logs
        if env['HTTP_AUTHORIZATION']
          env['mcp.original_auth'] = env['HTTP_AUTHORIZATION']
          env['HTTP_AUTHORIZATION'] = self.class.redact_string(env['HTTP_AUTHORIZATION'])
        end

        @app.call(env)
      ensure
        # Restore original auth header
        if env['mcp.original_auth']
          env['HTTP_AUTHORIZATION'] = env['mcp.original_auth']
        end
      end
    end
  end
end
