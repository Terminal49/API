# Terminal49 TypeScript MCP Server

It is generated with [Stainless](https://www.stainless.com/).

## Installation

### Building

Because it's not published yet, clone the repo and build it:

```sh
git clone git@github.com:Terminal49/API.git
cd API
./scripts/bootstrap
./scripts/build
```

### Running

```sh
# set env vars as needed
export TERMINAL49_API_KEY="My API Key"
node ./packages/mcp-server/dist/index.js
```

> [!NOTE]
> Once this package is [published to npm](https://www.stainless.com/docs/guides/publish), this will become: `npx -y terminal49-mcp`

### Via MCP Client

[Build the project](#building) as mentioned above.

There is a partial list of existing clients at [modelcontextprotocol.io](https://modelcontextprotocol.io/clients). If you already
have a client, consult their documentation to install the MCP server.

For clients with a configuration JSON, it might look something like this:

```json
{
  "mcpServers": {
    "terminal49_api": {
      "command": "node",
      "args": ["/path/to/local/API/packages/mcp-server", "--client=claude", "--tools=dynamic"],
      "env": {
        "TERMINAL49_API_KEY": "My API Key"
      }
    }
  }
}
```

## Exposing endpoints to your MCP Client

There are three ways to expose endpoints as tools in the MCP server:

1. Exposing one tool per endpoint, and filtering as necessary
2. Exposing a set of tools to dynamically discover and invoke endpoints from the API
3. Exposing a docs search tool and a code execution tool, allowing the client to write code to be executed against the TypeScript client

### Filtering endpoints and tools

You can run the package on the command line to discover and filter the set of tools that are exposed by the
MCP Server. This can be helpful for large APIs where including all endpoints at once is too much for your AI's
context window.

You can filter by multiple aspects:

- `--tool` includes a specific tool by name
- `--resource` includes all tools under a specific resource, and can have wildcards, e.g. `my.resource*`
- `--operation` includes just read (get/list) or just write operations

### Dynamic tools

If you specify `--tools=dynamic` to the MCP server, instead of exposing one tool per endpoint in the API, it will
expose the following tools:

1. `list_api_endpoints` - Discovers available endpoints, with optional filtering by search query
2. `get_api_endpoint_schema` - Gets detailed schema information for a specific endpoint
3. `invoke_api_endpoint` - Executes any endpoint with the appropriate parameters

This allows you to have the full set of API endpoints available to your MCP Client, while not requiring that all
of their schemas be loaded into context at once. Instead, the LLM will automatically use these tools together to
search for, look up, and invoke endpoints dynamically. However, due to the indirect nature of the schemas, it
can struggle to provide the correct properties a bit more than when tools are imported explicitly. Therefore,
you can opt-in to explicit tools, the dynamic tools, or both.

See more information with `--help`.

All of these command-line options can be repeated, combined together, and have corresponding exclusion versions (e.g. `--no-tool`).

Use `--list` to see the list of available tools, or see below.

### Code execution

If you specify `--tools=code` to the MCP server, it will expose just two tools:

- `search_docs` - Searches the API documentation and returns a list of markdown results
- `execute` - Runs code against the TypeScript client

This allows the LLM to implement more complex logic by chaining together many API calls without loading
intermediary results into its context window.

The code execution itself happens in a Deno sandbox that has network access only to the base URL for the API.

### Specifying the MCP Client

Different clients have varying abilities to handle arbitrary tools and schemas.

You can specify the client you are using with the `--client` argument, and the MCP server will automatically
serve tools and schemas that are more compatible with that client.

- `--client=<type>`: Set all capabilities based on a known MCP client

  - Valid values: `openai-agents`, `claude`, `claude-code`, `cursor`
  - Example: `--client=cursor`

Additionally, if you have a client not on the above list, or the client has gotten better
over time, you can manually enable or disable certain capabilities:

- `--capability=<name>`: Specify individual client capabilities
  - Available capabilities:
    - `top-level-unions`: Enable support for top-level unions in tool schemas
    - `valid-json`: Enable JSON string parsing for arguments
    - `refs`: Enable support for $ref pointers in schemas
    - `unions`: Enable support for union types (anyOf) in schemas
    - `formats`: Enable support for format validations in schemas (e.g. date-time, email)
    - `tool-name-length=N`: Set maximum tool name length to N characters
  - Example: `--capability=top-level-unions --capability=tool-name-length=40`
  - Example: `--capability=top-level-unions,tool-name-length=40`

### Examples

1. Filter for read operations on cards:

```bash
--resource=cards --operation=read
```

2. Exclude specific tools while including others:

```bash
--resource=cards --no-tool=create_cards
```

3. Configure for Cursor client with custom max tool name length:

```bash
--client=cursor --capability=tool-name-length=40
```

4. Complex filtering with multiple criteria:

```bash
--resource=cards,accounts --operation=read --tag=kyc --no-tool=create_cards
```

## Running remotely

Launching the client with `--transport=http` launches the server as a remote server using Streamable HTTP transport. The `--port` setting can choose the port it will run on, and the `--socket` setting allows it to run on a Unix socket.

Authorization can be provided via the following headers:
| Header | Equivalent client option | Security scheme |
| ---------------------- | ------------------------ | --------------- |
| `x-terminal49-api-key` | `apiKey` | authorization |

A configuration JSON for this server might look like this, assuming the server is hosted at `http://localhost:3000`:

```json
{
  "mcpServers": {
    "terminal49_api": {
      "url": "http://localhost:3000",
      "headers": {
        "x-terminal49-api-key": "My API Key"
      }
    }
  }
}
```

The command-line arguments for filtering tools and specifying clients can also be used as query parameters in the URL.
For example, to exclude specific tools while including others, use the URL:

```
http://localhost:3000?resource=cards&resource=accounts&no_tool=create_cards
```

Or, to configure for the Cursor client, with a custom max tool name length, use the URL:

```
http://localhost:3000?client=cursor&capability=tool-name-length%3D40
```

## Importing the tools and server individually

```js
// Import the server, generated endpoints, or the init function
import { server, endpoints, init } from "terminal49-mcp/server";

// import a specific tool
import retrieveShipments from "terminal49-mcp/tools/shipments/retrieve-shipments";

// initialize the server and all endpoints
init({ server, endpoints });

// manually start server
const transport = new StdioServerTransport();
await server.connect(transport);

// or initialize your own server with specific tools
const myServer = new McpServer(...);

// define your own endpoint
const myCustomEndpoint = {
  tool: {
    name: 'my_custom_tool',
    description: 'My custom tool',
    inputSchema: zodToJsonSchema(z.object({ a_property: z.string() })),
  },
  handler: async (client: client, args: any) => {
    return { myResponse: 'Hello world!' };
  })
};

// initialize the server with your custom endpoints
init({ server: myServer, endpoints: [retrieveShipments, myCustomEndpoint] });
```

## Available Tools

The following tools are available in this MCP server.

### Resource `shipments`:

- `retrieve_shipments` (`read`): Retrieves the details of an existing shipment. You need only supply the unique shipment `id` that was returned upon `tracking_request` creation.
- `update_shipments` (`write`): Update a shipment
- `list_shipments` (`read`): Returns a list of your shipments. The shipments are returned sorted by creation date, with the most recent shipments appearing first.

  This api will return all shipments associated with the account. Shipments created via the `tracking_request` API aswell as the ones added via the dashboard will be retuned via this endpoint.

- `resume_tracking_shipments` (`write`): Resume tracking a shipment. Keep in mind that some information is only made available by our data sources at specific times, so a stopped and resumed shipment may have some information missing.
- `stop_tracking_shipments` (`write`): We'll stop tracking the shipment, which means that there will be no more updates. You can still access the shipment's previously-collected information via the API or dashboard.

  You can resume tracking a shipment by calling the `resume_tracking` endpoint, but keep in mind that some information is only made available by our data sources at specific times, so a stopped and resumed shipment may have some information missing.

### Resource `tracking_requests`:

- `create_tracking_requests` (`write`): To track an ocean shipment, you create a new tracking request.
  Two attributes are required to track a shipment. A `bill of lading/booking number` and a shipping line `SCAC`.

  Once a tracking request is created we will attempt to fetch the shipment details and it's related containers from the shipping line. If the attempt is successful we will create in new shipment object including any related container objects. We will send a `tracking_request.succeeded` webhook notification to your webhooks.

  If the attempt to fetch fails then we will send a `tracking_request.failed` webhook notification to your `webhooks`.

  A `tracking_request.succeeded` or `tracking_request.failed` webhook notificaiton will only be sent if you have atleast one active webhook.

- `retrieve_tracking_requests` (`read`): Get the details and status of an existing tracking request.
- `update_tracking_requests` (`write`): Update a tracking request
- `list_tracking_requests` (`read`): Returns a list of your tracking requests. The tracking requests are returned sorted by creation date, with the most recent tracking request appearing first.

### Resource `webhooks`:

- `create_webhooks` (`write`): You can configure a webhook via the API to be notified about events that happen in your Terminal49 account. These events can be realted to tracking_requests, shipments and containers.

  This is the recommended way tracking shipments and containers via the API. You should use this instead of polling our the API periodically.

- `retrieve_webhooks` (`read`): Get the details of a single webhook
- `update_webhooks` (`write`): Update a single webhook
- `list_webhooks` (`read`): Get a list of all the webhooks
- `delete_webhooks` (`write`): Delete a webhook
- `list_ips_webhooks` (`read`): Return the list of IPs used for sending webhook notifications. This can be useful for whitelisting the IPs on the firewall.

### Resource `webhook_notifications`:

- `retrieve_webhook_notifications` (`read`):
- `list_webhook_notifications` (`read`): Return the list of webhook notifications. This can be useful for reconciling your data if your endpoint has been down.
- `get_examples_webhook_notifications` (`read`): Returns an example payload as it would be sent to a webhook endpoint for the provided `event`

### Resource `containers`:

- `retrieve_containers` (`read`): Retrieves the details of a container.
- `update_containers` (`write`): Update a container
- `list_containers` (`read`): Returns a list of container. The containers are returned sorted by creation date, with the most recently refreshed containers appearing first.

  This API will return all containers associated with the account.

- `get_raw_events_containers` (`read`): #### Deprecation warning
  The `raw_events` endpoint is provided as-is.

  For past events we recommend consuming `transport_events`.

  ***

  Get a list of past and future (estimated) milestones for a container as reported by the carrier. Some of the data is normalized even though the API is called raw_events.

  Normalized attributes: `event` and `timestamp` timestamp. Not all of the `event` values have been normalized. You can expect the the events related to container movements to be normalized but there are cases where events are not normalized.

  For past historical events we recommend consuming `transport_events`. Although there are fewer events here those events go through additional vetting and normalization to avoid false positives and get you correct data.

- `get_transport_events_containers` (`read`): Get a list of past transport events (canonical) for a container. All data has been normalized across all carriers. These are a verified subset of the raw events may also be sent as Webhook Notifications to a webhook endpoint.

  This does not provide any estimated future events. See `container/:id/raw_events` endpoint for that.

### Resource `shipping_lines`:

- `retrieve_shipping_lines` (`read`): Return the details of a single shipping line.
- `list_shipping_lines` (`read`): Return a list of shipping lines supported by Terminal49.
  N.B. There is no pagination for this endpoint.

### Resource `metro_areas`:

- `retrieve_metro_areas` (`read`): Return the details of a single metro area.

### Resource `ports`:

- `retrieve_ports` (`read`): Return the details of a single port.

### Resource `vessels`:

- `retrieve_by_id_vessels` (`read`): Returns a vessel by it's given identifier
- `retrieve_by_imo_vessels` (`read`): Returns a vessel by the given IMO number.

### Resource `terminals`:

- `retrieve_terminals` (`read`): Return the details of a single terminal.

### Resource `parties`:

- `create_parties` (`write`): Creates a new party
- `retrieve_parties` (`read`): Returns a party by it's given identifier
- `update_parties` (`write`): Updates a party
- `list_parties` (`read`): Get a list of parties
