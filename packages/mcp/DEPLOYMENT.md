# Deploying Terminal49 MCP Server to Vercel

## Prerequisites

- Terminal49 API token ([get yours here](https://app.terminal49.com/developers/api-keys))
- Vercel account (free tier works)
- GitHub account (recommended for automatic deployments)

---

## 🚀 Method 1: Deploy with Vercel CLI (Fastest)

### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy

From the root of the `API` repo:

```bash
vercel
```

Follow the prompts:
- **Set up and deploy?** Yes
- **Which scope?** Select your Vercel account
- **Link to existing project?** No
- **Project name?** `terminal49-mcp` (or your choice)
- **Directory?** `.` (root)
- **Override settings?** No

### Step 4: Add Environment Variable

```bash
vercel env add T49_API_TOKEN
```

When prompted:
- **Value:** Paste your Terminal49 API token
- **Environment:** Production, Preview, Development (select all)

### Step 5: Redeploy with Environment Variable

```bash
vercel --prod
```

### Step 6: Test Your Deployment

```bash
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

✅ **Done!** Your MCP server is live.

---

## 🔗 Method 2: Deploy with GitHub (Recommended for Continuous Deployment)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Add Terminal49 MCP server"
git push origin main
```

### Step 2: Import to Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your `API` repository
4. Configure:
   - **Framework Preset:** Other
   - **Root Directory:** `.` (leave as root)
   - **Build Command:** `cd packages/mcp && npm install && npm run build`
   - **Output Directory:** `packages/mcp/dist`

### Step 3: Add Environment Variables

In the Vercel import wizard, add:

| Name | Value |
|------|-------|
| `T49_API_TOKEN` | Your Terminal49 API token |
| `T49_API_BASE_URL` | `https://api.terminal49.com/v2` |

### Step 4: Deploy

Click "Deploy"

Vercel will:
1. Install dependencies
2. Build TypeScript
3. Deploy serverless function to `/api/mcp`

### Step 5: Test

```bash
curl -X POST https://terminal49-mcp.vercel.app/api/mcp \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {"name": "test", "version": "1.0"}
    },
    "id": 1
  }'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {}
    },
    "serverInfo": {
      "name": "terminal49-mcp",
      "version": "0.1.0"
    }
  },
  "id": 1
}
```

✅ **Done!** Future pushes to `main` will auto-deploy.

---

## 🔧 Method 3: Deploy with Vercel Button (One-Click)

### Step 1: Add Deploy Button to README

Add this to your repository README:

```markdown
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Terminal49/API)
```

### Step 2: Click Deploy

Users can click the button to deploy their own instance.

### Step 3: Configure During Deployment

Vercel will prompt for environment variables:
- `T49_API_TOKEN`

---

## 🛠️ Vercel Configuration

The project includes `vercel.json`:

```json
{
  "version": 2,
  "functions": {
    "api/mcp.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "env": {
    "T49_API_TOKEN": "@t49_api_token"
  }
}
```

### Configuration Options

| Setting | Value | Notes |
|---------|-------|-------|
| `runtime` | `nodejs20.x` | Node.js version |
| `maxDuration` | `30` | Max execution time (seconds) |
| `memory` | `1024` | Memory allocation (MB) |

**Pro/Enterprise users** can increase `maxDuration` up to 900 seconds (15 minutes).

---

## 🌍 Custom Domains

### Add Custom Domain

```bash
vercel domains add api.yourcompany.com
```

Your MCP endpoint will be:
```
https://api.yourcompany.com/api/mcp
```

---

## 📊 Monitoring & Logs

### View Logs

```bash
# Real-time logs
vercel logs --follow

# Recent logs
vercel logs

# Function-specific logs
vercel logs --function api/mcp
```

### Vercel Dashboard

Access detailed metrics at:
https://vercel.com/your-username/terminal49-mcp

Includes:
- Request count
- Response time (p50, p75, p99)
- Error rate
- Bandwidth usage

---

## 🔐 Environment Variables Management

### Add Variable

```bash
vercel env add VARIABLE_NAME
```

### List Variables

```bash
vercel env ls
```

### Remove Variable

```bash
vercel env rm VARIABLE_NAME
```

### Pull Variables Locally

```bash
vercel env pull .env.local
```

---

## 🐛 Troubleshooting

### Error: "Module not found"

**Cause:** TypeScript not compiled

**Solution:**
```bash
cd packages/mcp
npm install
npm run build
vercel --prod
```

### Error: "Function execution timeout"

**Cause:** Request took > 30 seconds

**Solution:** Upgrade to Vercel Pro and increase `maxDuration`:
```json
{
  "functions": {
    "api/mcp.ts": {
      "maxDuration": 60
    }
  }
}
```

### Error: "Invalid T49_API_TOKEN"

**Cause:** Environment variable not set

**Solution:**
```bash
vercel env add T49_API_TOKEN
vercel --prod
```

### CORS Issues

**Cause:** Missing CORS headers

**Solution:** Already configured in `vercel.json`. If issues persist:
```bash
vercel logs --function api/mcp
```

---

## 🚀 Performance Optimization

### Enable Edge Runtime (Optional)

For lowest latency, use Edge Runtime:

```typescript
// api/mcp.ts
export const config = {
  runtime: 'edge',
};
```

**Note:** Edge Runtime has limitations (no Node.js APIs).

### Caching

Add caching headers for resource endpoints:

```typescript
res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
```

---

## 🔄 Continuous Deployment

### Automatic Deployments

Every push to `main` triggers deployment:

1. Push code: `git push origin main`
2. Vercel detects changes
3. Runs build: `cd packages/mcp && npm run build`
4. Deploys new version
5. Updates production URL

### Preview Deployments

Every pull request gets a preview URL:

```
https://terminal49-mcp-git-feature-branch.vercel.app
```

Test before merging!

---

## 📈 Scaling

Vercel automatically scales based on traffic:

- **Free Tier:** 100 GB bandwidth, 100 serverless function invocations/day
- **Pro Tier:** 1 TB bandwidth, unlimited invocations
- **Enterprise:** Custom limits

No configuration needed—scales from 0 to millions of requests.

---

## 🆘 Support

### Vercel Support
- **Docs:** https://vercel.com/docs
- **Community:** https://github.com/vercel/vercel/discussions
- **Support:** https://vercel.com/support

### Terminal49 MCP Support
- **Issues:** https://github.com/Terminal49/API/issues
- **Docs:** `/packages/mcp/README.md`
- **Email:** support@terminal49.com

---

## ✅ Deployment Checklist

- [ ] Vercel account created
- [ ] Repository pushed to GitHub
- [ ] Project imported to Vercel
- [ ] `T49_API_TOKEN` environment variable set
- [ ] Production deployment successful
- [ ] Endpoint tested: `https://your-deployment.vercel.app/api/mcp`
- [ ] Claude Desktop/Cursor configured with MCP URL
- [ ] Custom domain configured (optional)
- [ ] Monitoring/logs verified

---

**Next Steps:**
- Configure your MCP client (Claude Desktop, Cursor, etc.)
- Test `get_container` tool
- Monitor logs for usage patterns
- Implement Sprint 2 tools (track_container, list_shipments, etc.)
