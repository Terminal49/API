#!/usr/bin/env ruby
# Example MCP client for testing Terminal49 MCP server

require 'json'
require 'open3'

# Path to the MCP server binary
MCP_SERVER_BIN = File.expand_path('../bin/terminal49-mcp', __dir__)

def send_request(request)
  json_request = JSON.generate(request)
  puts "\n==> Sending request:"
  puts JSON.pretty_generate(request)
  puts ""

  # Start the MCP server process
  stdout, stderr, status = Open3.capture3(
    { 'T49_API_TOKEN' => ENV['T49_API_TOKEN'] || 'your_token_here' },
    "echo '#{json_request}' | #{MCP_SERVER_BIN}"
  )

  if status.success?
    response = JSON.parse(stdout)
    puts "==> Response:"
    puts JSON.pretty_generate(response)
  else
    puts "==> Error:"
    puts stderr
  end
end

# Test 1: Initialize
puts "\n" + "=" * 80
puts "TEST 1: Initialize"
puts "=" * 80
send_request({
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  },
  id: 1
})

# Test 2: List Tools
puts "\n" + "=" * 80
puts "TEST 2: List Tools"
puts "=" * 80
send_request({
  jsonrpc: '2.0',
  method: 'tools/list',
  id: 2
})

# Test 3: List Resources
puts "\n" + "=" * 80
puts "TEST 3: List Resources"
puts "=" * 80
send_request({
  jsonrpc: '2.0',
  method: 'resources/list',
  id: 3
})

# Test 4: Call get_container tool (will fail without valid ID and token)
puts "\n" + "=" * 80
puts "TEST 4: Call get_container (demo)"
puts "=" * 80
send_request({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'get_container',
    arguments: {
      id: '123e4567-e89b-12d3-a456-426614174000'
    }
  },
  id: 4
})

puts "\n" + "=" * 80
puts "Tests complete!"
puts "=" * 80
