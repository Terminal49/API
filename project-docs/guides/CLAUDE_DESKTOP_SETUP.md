# 🖥️ Claude Desktop Setup - Terminal49 MCP Server

## ✅ Configuration Complete!

Your Claude Desktop is now configured to use the Terminal49 MCP Server.

**Config File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Server Path:** `/Users/dodeja/dev/t49/API/packages/mcp/dist/index.js`

---

## 🚀 Next Steps

### Step 1: Restart Claude Desktop

**IMPORTANT:** You must fully restart Claude Desktop for changes to take effect.

1. **Quit Claude Desktop** (⌘+Q or File → Quit)
2. **Wait 3 seconds**
3. **Relaunch Claude Desktop**

---

### Step 2: Verify MCP Server is Connected

After restarting, look for these indicators:

1. **Check the status bar** at the bottom of Claude Desktop
2. You should see a **hammer icon 🔨** or MCP indicator
3. Click it to see connected servers
4. **"terminal49"** should appear in the list

**Troubleshooting if not showing:**
- Check View → Developer → View Logs for errors
- Make sure the path in config is correct
- Ensure Node.js is installed

---

### Step 3: Test the MCP Server

Try these test queries in Claude Desktop:

#### Test 1: List Available Tools
```
What tools do you have available from Terminal49?
```

**Expected Response:** Claude should list 7 tools:
- search_container
- track_container
- get_container
- get_shipment_details
- get_container_transport_events
- get_supported_shipping_lines
- get_container_route

---

#### Test 2: Search for Containers
```
Search for containers with "CAIU" in the number
```

**Expected:** Claude will use the `search_container` tool and return results

---

#### Test 3: Get Shipping Lines
```
What carriers does Terminal49 support? Search for Maersk
```

**Expected:** Claude will use `get_supported_shipping_lines` and return Maersk info (SCAC: MAEU)

---

#### Test 4: Read the Glossary
```
Show me the milestone glossary from Terminal49
```

**Expected:** Claude will read the milestone glossary resource

---

## 🔍 Debugging

### Check if Server Started
Open **View → Developer → View Logs** in Claude Desktop and look for:
```
Terminal49 MCP Server v1.0.0 running on stdio
Available tools: 7 | Resources: 2
```

### Common Issues

**Issue: Server not appearing**
- **Solution:** Make sure you fully quit (⌘+Q) and restarted Claude Desktop

**Issue: "Cannot find module" error**
- **Solution:** Run `npm run build` again in the packages/mcp directory

**Issue: "Authentication failed"**
- **Solution:** Check that T49_API_TOKEN in config is correct

**Issue: Tools show but don't work**
- **Solution:** Check Developer Logs for API errors

---

## 📊 What You Can Do

With the Terminal49 MCP server, Claude Desktop can now:

### 🔍 Search & Track
- Search for containers by number, BL, booking, or reference
- Create tracking requests for new containers
- Get real-time container status updates

### 📦 Container Details
- View full container information with flexible data loading
- Get transport event timelines
- See routing and vessel itineraries
- Check demurrage and detention status

### 🚢 Shipping Line Info
- List 40+ supported carriers
- Search by carrier name or SCAC code
- Get carrier details and regions

### 📚 Resources
- Access the complete milestone glossary
- Read container summaries in Markdown format

---

## 🎯 Example Conversations

### Example 1: Track a Shipment
**You:** "I need to track container CAIU2885402"

**Claude:** *Uses search_container tool*
"I found the container. Let me get the details..."

**Claude:** *Uses get_container tool*
"Here's the status: [details]"

### Example 2: Check Demurrage Risk
**You:** "Is container XYZ at risk of demurrage charges?"

**Claude:** *Uses get_container with pod_terminal include*
"Based on the data: [analysis of LFD, availability, holds]"

### Example 3: Analyze Journey
**You:** "What happened to container ABC during its journey?"

**Claude:** *Uses get_container_transport_events*
"Here's the timeline: [event breakdown with delays highlighted]"

---

## 🛠️ Technical Details

**MCP Server Configuration:**
```json
{
  "mcpServers": {
    "terminal49": {
      "command": "node",
      "args": ["/Users/dodeja/dev/t49/API/packages/mcp/dist/index.js"],
      "env": {
        "T49_API_TOKEN": "kJVzEaVQzRmyGCwcXVcTJAwU",
        "T49_API_BASE_URL": "https://api.terminal49.com/v2"
      }
    }
  }
}
```

**Server Version:** 1.0.0
**SDK Version:** @modelcontextprotocol/sdk v0.5.0
**Transport:** stdio (local)
**Status:** Production Ready ✅

---

## 📝 Quick Reference

| Tool | Purpose | Example Query |
|------|---------|---------------|
| `search_container` | Find containers/shipments | "Search for MAEU123" |
| `track_container` | Create tracking request | "Track container CAIU..." |
| `get_container` | Get full container details | "Show me container details for..." |
| `get_shipment_details` | Get shipment info | "Get shipment details..." |
| `get_container_transport_events` | View journey timeline | "What happened to..." |
| `get_supported_shipping_lines` | List carriers | "What carriers are supported?" |
| `get_container_route` | View routing | "Show me the route for..." |

---

## ✅ Setup Checklist

- [x] MCP server built (`dist/index.js` exists)
- [x] Claude Desktop config updated
- [ ] Claude Desktop restarted
- [ ] Server appears in MCP list
- [ ] Test query successful

---

**Ready to test? Restart Claude Desktop and try the test queries above!** 🚀

Need help? Check the Developer Logs in Claude Desktop (View → Developer → View Logs)
