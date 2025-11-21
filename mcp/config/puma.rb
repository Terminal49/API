workers Integer(ENV.fetch('WEB_CONCURRENCY', 2))
threads_count = Integer(ENV.fetch('RAILS_MAX_THREADS', 5))
threads threads_count, threads_count

preload_app!

rackup 'config.ru'
port ENV.fetch('MCP_SERVER_PORT', 3001)
environment ENV.fetch('RACK_ENV', 'development')

on_worker_boot do
  require_relative '../lib/terminal49_mcp'
  Terminal49MCP.configure
end
