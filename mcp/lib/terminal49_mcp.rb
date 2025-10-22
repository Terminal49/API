require 'mcp'
require 'faraday'
require 'faraday/retry'
require 'logger'
require 'json'

module Terminal49MCP
  class Error < StandardError; end
  class AuthenticationError < Error; end
  class NotFoundError < Error; end
  class ValidationError < Error; end
  class RateLimitError < Error; end
  class UpstreamError < Error; end

  class << self
    attr_accessor :configuration

    def configure
      self.configuration ||= Configuration.new
      yield(configuration) if block_given?
    end

    def logger
      configuration.logger
    end
  end

  class Configuration
    attr_accessor :api_token, :api_base_url, :log_level, :redact_logs

    def initialize
      @api_token = ENV['T49_API_TOKEN']
      @api_base_url = ENV['T49_API_BASE_URL'] || 'https://api.terminal49.com/v2'
      @log_level = ENV['MCP_LOG_LEVEL'] || 'info'
      @redact_logs = ENV['MCP_REDACT_LOGS'] != 'false'
      @logger = Logger.new($stdout)
      @logger.level = Logger.const_get(log_level.upcase)
    end

    def logger
      @logger
    end
  end
end

# Load core components
require_relative 'terminal49_mcp/version'
require_relative 'terminal49_mcp/client'
require_relative 'terminal49_mcp/middleware/auth'
require_relative 'terminal49_mcp/middleware/logging'
require_relative 'terminal49_mcp/middleware/redaction'
require_relative 'terminal49_mcp/server'
require_relative 'terminal49_mcp/tools/get_container'
require_relative 'terminal49_mcp/resources/container'
