require 'mcp'
require 'json'

module Terminal49MCP
  # MCP Server implementation
  # Handles both stdio and HTTP transports
  class Server
    attr_reader :tools, :resources, :prompts

    def initialize
      @tools = {}
      @resources = {}
      @prompts = {}

      register_tools
      register_resources
      register_prompts
    end

    # Start stdio transport (for local MCP clients like Claude Desktop)
    def start_stdio
      Terminal49MCP.logger.info("Starting Terminal49 MCP Server (stdio) v#{Terminal49MCP::VERSION}")

      # MCP stdio protocol handler
      $stdin.each_line do |line|
        begin
          request = JSON.parse(line.strip)
          response = handle_request(request)
          puts JSON.generate(response)
          $stdout.flush
        rescue JSON::ParserError => e
          Terminal49MCP.logger.error("Invalid JSON: #{e.message}")
          error_response = {
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
            id: nil
          }
          puts JSON.generate(error_response)
          $stdout.flush
        rescue => e
          Terminal49MCP.logger.error("Error handling request: #{e.message}\n#{e.backtrace.join("\n")}")
          error_response = {
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error', data: e.message },
            id: request&.dig('id')
          }
          puts JSON.generate(error_response)
          $stdout.flush
        end
      end
    end

    # Handle MCP protocol requests
    def handle_request(request)
      method = request['method']
      params = request['params'] || {}
      id = request['id']

      case method
      when 'initialize'
        handle_initialize(id)
      when 'tools/list'
        handle_tools_list(id)
      when 'tools/call'
        handle_tool_call(id, params)
      when 'resources/list'
        handle_resources_list(id)
      when 'resources/read'
        handle_resource_read(id, params)
      when 'prompts/list'
        handle_prompts_list(id)
      when 'prompts/get'
        handle_prompt_get(id, params)
      else
        {
          jsonrpc: '2.0',
          error: { code: -32601, message: "Method not found: #{method}" },
          id: id
        }
      end
    end

    private

    def handle_initialize(id)
      {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: { subscribe: false },
            prompts: {}
          },
          serverInfo: {
            name: 'terminal49-mcp',
            version: Terminal49MCP::VERSION
          }
        },
        id: id
      }
    end

    def handle_tools_list(id)
      {
        jsonrpc: '2.0',
        result: {
          tools: @tools.values.map(&:to_schema)
        },
        id: id
      }
    end

    def handle_tool_call(id, params)
      tool_name = params['name']
      arguments = params['arguments'] || {}

      tool = @tools[tool_name]
      unless tool
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: "Unknown tool: #{tool_name}" },
          id: id
        }
      end

      result = tool.execute(arguments)

      {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(result)
            }
          ]
        },
        id: id
      }
    rescue Terminal49MCP::Error => e
      {
        jsonrpc: '2.0',
        error: {
          code: error_code_for_exception(e),
          message: e.message
        },
        id: id
      }
    end

    def handle_resources_list(id)
      {
        jsonrpc: '2.0',
        result: {
          resources: @resources.values.map(&:to_schema)
        },
        id: id
      }
    end

    def handle_resource_read(id, params)
      uri = params['uri']

      resource = @resources.values.find { |r| r.matches?(uri) }
      unless resource
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: "Unknown resource: #{uri}" },
          id: id
        }
      end

      content = resource.read(uri)

      {
        jsonrpc: '2.0',
        result: {
          contents: [content]
        },
        id: id
      }
    rescue Terminal49MCP::Error => e
      {
        jsonrpc: '2.0',
        error: {
          code: error_code_for_exception(e),
          message: e.message
        },
        id: id
      }
    end

    def handle_prompts_list(id)
      {
        jsonrpc: '2.0',
        result: {
          prompts: @prompts.values.map(&:to_schema)
        },
        id: id
      }
    end

    def handle_prompt_get(id, params)
      prompt_name = params['name']
      arguments = params['arguments'] || {}

      prompt = @prompts[prompt_name]
      unless prompt
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: "Unknown prompt: #{prompt_name}" },
          id: id
        }
      end

      messages = prompt.generate(arguments)

      {
        jsonrpc: '2.0',
        result: {
          messages: messages
        },
        id: id
      }
    end

    def register_tools
      @tools['get_container'] = Tools::GetContainer.new
    end

    def register_resources
      @resources['container'] = Resources::Container.new
    end

    def register_prompts
      # Prompts will be added in Sprint 2
    end

    def error_code_for_exception(exception)
      case exception
      when AuthenticationError
        -32001  # Authentication error
      when NotFoundError
        -32002  # Not found
      when ValidationError
        -32602  # Invalid params
      when RateLimitError
        -32003  # Rate limit
      when UpstreamError
        -32004  # Upstream error
      else
        -32603  # Internal error
      end
    end
  end
end
