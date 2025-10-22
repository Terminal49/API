require 'bundler/setup'
require 'dotenv/load'
require 'terminal49_mcp'
require 'vcr'
require 'webmock/rspec'
require 'pry'

# Configure VCR for recording/replaying HTTP interactions
VCR.configure do |config|
  config.cassette_library_dir = 'spec/fixtures/vcr_cassettes'
  config.hook_into :webmock
  config.configure_rspec_metadata!

  # Redact sensitive data in cassettes
  config.filter_sensitive_data('<API_TOKEN>') do |interaction|
    interaction.request.headers['Authorization']&.first
  end

  config.filter_sensitive_data('<API_BASE_URL>') do
    ENV['T49_API_BASE_URL'] || 'https://api.terminal49.com/v2'
  end

  # Allow localhost connections (for testing HTTP transport)
  config.ignore_localhost = true

  # Default cassette options
  config.default_cassette_options = {
    record: :once,
    match_requests_on: [:method, :uri, :body]
  }
end

# Configure Terminal49MCP for testing
Terminal49MCP.configure do |config|
  config.api_token = ENV['T49_API_TOKEN'] || 'test_token_123'
  config.api_base_url = ENV['T49_API_BASE_URL'] || 'https://api.terminal49.com/v2'
  config.log_level = 'error'
  config.redact_logs = true
end

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups
  config.filter_run_when_matching :focus
  config.example_status_persistence_file_path = 'spec/examples.txt'
  config.disable_monkey_patching!
  config.warnings = true

  config.default_formatter = 'doc' if config.files_to_run.one?

  config.profile_examples = 10
  config.order = :random
  Kernel.srand config.seed
end
