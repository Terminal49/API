# Vercel Setup Checklist - Production & Preview Deployments

**Project**: Terminal49 MCP Server
**Vercel Project**: `api` (ID: prj_h4pzjWbMAU5G5f7QxWW6Xh5431Oc)
**Repository**: Terminal49/API

Use this checklist to verify your Vercel project is correctly configured for both production and preview deployments.

---

## ✅ Quick Verification Commands

Run these commands to check your setup:

```bash
# 1. Check project is linked
ls .vercel/project.json
# ✅ Should exist

# 2. Check Git integration
vercel git
# ✅ Should show production branch and preview settings

# 3. Check environment variables
vercel env ls
# ✅ Should show T49_API_TOKEN for Production, Preview, Development

# 4. List recent deployments
vercel ls
# ✅ Should show deployments

# 5. Check project settings
vercel project ls
# ✅ Should show "api" project
```

---

## 📋 Complete Setup Checklist

### 1. Project Linking ✅

- [x] **Project linked to Vercel**
  ```bash
  ls .vercel/project.json
  # File exists with projectId
  ```

- [ ] **Correct project name**
  ```bash
  cat .vercel/project.json
  # Should show: "projectName": "api"
  ```

- [ ] **Correct organization**
  ```bash
  cat .vercel/project.json
  # Should show your team orgId
  ```

**If not linked**:
```bash
vercel link
# Select: Terminal49 (team)
# Select: api (project)
```

---

### 2. GitHub Integration

- [ ] **Vercel GitHub App installed**
  - Go to: https://github.com/apps/vercel
  - Click "Configure"
  - Verify Terminal49 organization
  - Verify API repository has access

- [ ] **Repository connected in Vercel**
  - Go to: https://vercel.com/[team]/api/settings/git
  - Should show: Git Repository: Terminal49/API
  - Should show: Connected via GitHub

- [ ] **Production branch configured**
  ```bash
  vercel git
  # Should show: Production Branch: master
  ```

**Manual Setup**:
1. Go to https://vercel.com/[team]/api/settings/git
2. Click "Connect Git Repository"
3. Select "Terminal49/API"
4. Set Production Branch: `master`

---

### 3. Build Configuration

- [ ] **Build command configured**
  ```bash
  # Check vercel.json exists
  cat vercel.json | grep buildCommand
  # Should show: "cd mcp-ts && npm install && npm run build"
  ```

- [ ] **Output directory configured**
  ```bash
  cat vercel.json | grep outputDirectory
  # Should show: "mcp-ts/dist"
  ```

- [ ] **Functions configured**
  ```bash
  cat vercel.json | grep -A5 functions
  # Should show api/mcp.ts and api/sse.ts
  ```

- [ ] **Build succeeds locally**
  ```bash
  cd mcp-ts
  npm install
  npm run build
  # Should complete without errors
  ```

**Current Configuration** (`vercel.json`):
```json
{
  "buildCommand": "cd mcp-ts && npm install && npm run build",
  "outputDirectory": "mcp-ts/dist",
  "functions": {
    "api/mcp.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 30,
      "memory": 1024
    },
    "api/sse.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

---

### 4. Environment Variables

- [ ] **T49_API_TOKEN set for Production**
  ```bash
  vercel env ls | grep T49_API_TOKEN | grep Production
  ```

- [ ] **T49_API_TOKEN set for Preview**
  ```bash
  vercel env ls | grep T49_API_TOKEN | grep Preview
  ```

- [ ] **T49_API_TOKEN set for Development**
  ```bash
  vercel env ls | grep T49_API_TOKEN | grep Development
  ```

- [ ] **T49_API_BASE_URL configured** (optional)
  ```bash
  vercel env ls | grep T49_API_BASE_URL
  # Default: https://api.terminal49.com/v2
  ```

**If missing**:
```bash
# Add for all environments
vercel env add T49_API_TOKEN
# When prompted, select: Production, Preview, Development
# Enter your Terminal49 API token

# Or add for specific environment
vercel env add T49_API_TOKEN production
vercel env add T49_API_TOKEN preview
vercel env add T49_API_TOKEN development
```

**Verify**:
```bash
vercel env ls
# Expected output:
# T49_API_TOKEN          Production, Preview, Development
# T49_API_BASE_URL       Production, Preview, Development (if set)
```

---

### 5. Preview Deployments

- [ ] **Preview deployments enabled**
  - Go to: https://vercel.com/[team]/api/settings/git
  - Check: "Preview Deployments" is ON
  - Check: "All branches" or specific pattern

- [ ] **Auto-deploy on push enabled**
  - Same page as above
  - Check: "Auto-deploy" is ON

- [ ] **PR comments enabled**
  - Check `vercel.json`:
  ```json
  {
    "github": {
      "silent": false  // Should be false or omitted
    }
  }
  ```

**Test**:
```bash
# Create test commit
git commit --allow-empty -m "test: Trigger preview deployment"
git push origin feature/mcp-phase-1

# Check Vercel dashboard in 60 seconds
# Should see new deployment
```

---

### 6. Production Deployments

- [ ] **Production branch is `master`**
  ```bash
  vercel git | grep "Production Branch"
  # Should show: master
  ```

- [ ] **Auto-deploy on merge enabled**
  - Go to: https://vercel.com/[team]/api/settings/git
  - Check: "Auto-deploy" is ON for production

- [ ] **Production URL assigned**
  - Go to: https://vercel.com/[team]/api/settings/domains
  - Should show production domain

**Test**:
```bash
# Merge to master (after PR approval)
git checkout master
git merge feature/mcp-phase-1
git push origin master

# Check Vercel dashboard
# Should see production deployment
```

---

### 7. Domain Configuration

- [ ] **Default Vercel domain works**
  ```bash
  curl https://api-[team].vercel.app/mcp \
    -X POST \
    -H "Authorization: Bearer $T49_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
  ```

- [ ] **Custom domain configured** (optional)
  - Go to: https://vercel.com/[team]/api/settings/domains
  - Add: `mcp.terminal49.com`
  - Configure DNS: See CUSTOM_DOMAIN_SETUP.md

---

### 8. URL Rewrites

- [ ] **Rewrites configured in vercel.json**
  ```bash
  cat vercel.json | grep -A10 rewrites
  # Should show:
  # /mcp → /api/mcp
  # /sse → /api/sse
  ```

- [ ] **Clean URLs work**
  ```bash
  # Test /mcp (not /api/mcp)
  curl -X POST https://[your-url].vercel.app/mcp \
    -H "Authorization: Bearer $T49_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

  # Should return JSON response, not 404
  ```

**Current Configuration**:
```json
{
  "rewrites": [
    {"source": "/mcp", "destination": "/api/mcp"},
    {"source": "/sse", "destination": "/api/sse"}
  ]
}
```

---

### 9. CORS Configuration

- [ ] **CORS headers configured**
  ```bash
  cat vercel.json | grep -A20 headers
  # Should show Access-Control-Allow-Origin headers
  ```

- [ ] **CORS works for OPTIONS requests**
  ```bash
  curl -X OPTIONS https://[your-url].vercel.app/mcp \
    -H "Origin: https://example.com" \
    -v
  # Should return 200 OK with Access-Control-Allow-* headers
  ```

**Current Configuration**:
```json
{
  "headers": [
    {
      "source": "/mcp",
      "headers": [
        {"key": "Access-Control-Allow-Origin", "value": "*"},
        {"key": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"},
        {"key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization"}
      ]
    },
    {
      "source": "/sse",
      "headers": [
        {"key": "Access-Control-Allow-Origin", "value": "*"},
        {"key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS"},
        {"key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization"}
      ]
    }
  ]
}
```

---

### 10. Testing Both Transports

#### HTTP Transport (`/mcp`)

- [ ] **HTTP endpoint responds**
  ```bash
  curl -X POST https://[your-url].vercel.app/mcp \
    -H "Authorization: Bearer $T49_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

  # Should return: {"jsonrpc":"2.0","result":{...},"id":1}
  ```

- [ ] **All 7 tools work**
  ```bash
  # Test search_container
  curl -X POST https://[your-url].vercel.app/mcp \
    -H "Authorization: Bearer $T49_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_container","arguments":{"query":"CAIU"}},"id":2}'

  # Should return search results
  ```

#### SSE Transport (`/sse`)

- [ ] **SSE endpoint responds**
  ```bash
  curl -N https://[your-url].vercel.app/sse \
    -H "Authorization: Bearer $T49_API_TOKEN"

  # Should open SSE stream and send events
  ```

- [ ] **POST to SSE works**
  ```bash
  # First: Get sessionId from SSE stream above
  # Then:
  curl -X POST "https://[your-url].vercel.app/sse?sessionId=YOUR_SESSION_ID" \
    -H "Authorization: Bearer $T49_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
  ```

---

## 🚀 End-to-End Test

Run this complete test to verify everything:

```bash
#!/bin/bash

# Set variables
VERCEL_URL="https://api-[team].vercel.app"  # Update this
TOKEN="$T49_API_TOKEN"  # Or paste token directly

echo "Testing Vercel MCP Server Setup..."
echo ""

# Test 1: HTTP tools/list
echo "1. Testing HTTP /mcp (tools/list)..."
curl -s -X POST "$VERCEL_URL/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | jq -r '.result.tools[].name'

echo ""

# Test 2: HTTP tool call
echo "2. Testing HTTP /mcp (search_container)..."
curl -s -X POST "$VERCEL_URL/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_supported_shipping_lines","arguments":{}},"id":2}' \
  | jq -r '.result.structuredContent.carriers[0:3][].name'

echo ""

# Test 3: SSE connection
echo "3. Testing SSE /sse (5 second test)..."
timeout 5 curl -N "$VERCEL_URL/sse" \
  -H "Authorization: Bearer $TOKEN" \
  || echo "SSE stream opened successfully"

echo ""
echo "✅ All tests complete!"
```

**Expected Output**:
```
Testing Vercel MCP Server Setup...

1. Testing HTTP /mcp (tools/list)...
search_container
track_container
get_container
get_shipment_details
get_container_transport_events
get_supported_shipping_lines
get_container_route

2. Testing HTTP /mcp (search_container)...
Maersk Line
CMA CGM
MSC

3. Testing SSE /sse (5 second test)...
SSE stream opened successfully

✅ All tests complete!
```

---

## 📊 Verification Summary

After completing this checklist, you should have:

### ✅ Production Setup
- [x] Project linked to Vercel
- [ ] Production branch: `master`
- [ ] Environment variables configured
- [ ] Auto-deploy on merge to `master`
- [ ] Production URL working

### ✅ Preview Setup
- [ ] Preview deployments enabled
- [ ] Auto-deploy on push to branches
- [ ] PR comments enabled
- [ ] Environment variables for preview
- [ ] Preview URLs working

### ✅ Endpoints
- [ ] `/mcp` HTTP endpoint working
- [ ] `/sse` SSE endpoint working
- [ ] All 7 tools functional
- [ ] 3 prompts functional
- [ ] 2 resources functional

### ✅ Configuration
- [ ] `vercel.json` properly configured
- [ ] Build command correct
- [ ] Functions configured (30s/60s timeouts)
- [ ] URL rewrites working
- [ ] CORS headers correct

---

## 🐛 Common Issues & Fixes

### Issue: Preview not deploying

**Fix**:
```bash
# Check GitHub app has access
open https://github.com/apps/vercel

# Manually trigger
vercel --force
```

### Issue: Environment variable missing

**Fix**:
```bash
# Add for preview
vercel env add T49_API_TOKEN preview
```

### Issue: Build failing

**Fix**:
```bash
# Test locally
cd mcp-ts && npm install && npm run build

# Check logs
vercel logs --follow
```

### Issue: 404 on /mcp

**Fix**:
Check `vercel.json` has rewrites:
```json
{
  "rewrites": [
    {"source": "/mcp", "destination": "/api/mcp"}
  ]
}
```

---

## 🎯 Quick Commands Reference

```bash
# Check project status
vercel project ls

# Check deployments
vercel ls

# Check environment variables
vercel env ls

# Check Git integration
vercel git

# Manual deploy
vercel --prod           # Production
vercel                  # Preview

# View logs
vercel logs --follow

# Pull environment variables
vercel env pull .env.local
```

---

## 📚 Documentation Links

- **VERCEL_PREVIEW_SETUP.md** - Detailed preview deployment guide
- **CUSTOM_DOMAIN_SETUP.md** - Custom domain configuration
- **mcp-ts/TRANSPORT_SUPPORT.md** - HTTP vs SSE comparison
- **mcp-ts/EXECUTION_SUMMARY.md** - Complete implementation summary

---

## ✅ Final Verification

Once all items are checked:

1. **Create PR**:
   ```bash
   gh pr create --title "Upgrade MCP Server to SDK v1.20.1" --body-file PR_DESCRIPTION.md
   ```

2. **Verify preview comment appears** within 60 seconds

3. **Test preview URL** from PR comment

4. **Merge to master** after approval

5. **Verify production deployment** succeeds

---

**Status**: ✅ Project linked to Vercel
**Next**: Complete remaining checklist items above
