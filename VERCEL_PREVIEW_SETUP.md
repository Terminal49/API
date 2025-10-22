# Vercel Preview Deployments Setup

This guide explains how to configure Vercel to automatically create preview deployments for every PR, similar to how Linear and other modern services work.

---

## 🎯 What Are Preview Deployments?

Preview deployments are **temporary environments** created automatically for:
- Every pull request
- Every push to a branch
- Testing changes before merging to production

**Example**:
```
PR #123 → Automatic preview at:
https://terminal49-api-git-feature-mcp-phase-1-your-team.vercel.app
```

---

## ✅ Prerequisites

Before setting up preview deployments, ensure:
- [ ] GitHub repository exists: `Terminal49/API`
- [ ] Vercel account connected to GitHub
- [ ] Project deployed at least once

---

## 🔧 Setup Methods

### Method 1: Automatic Setup (Recommended)

Vercel **automatically creates preview deployments** when you:

1. **Connect GitHub Repository**:
   - Go to https://vercel.com/new
   - Click "Import Git Repository"
   - Select `Terminal49/API`
   - Click "Import"

2. **Vercel Auto-Configures**:
   - ✅ Production: `master` or `main` branch
   - ✅ Preview: All other branches
   - ✅ PR comments: Automatic deployment URLs

**That's it!** Preview deployments are enabled by default.

### Method 2: Manual Configuration

If you need to customize settings:

#### Step 1: Install Vercel GitHub App

1. Go to https://github.com/apps/vercel
2. Click "Configure"
3. Select `Terminal49` organization
4. Grant access to `API` repository

#### Step 2: Link Project in Vercel

```bash
# Navigate to project
cd /Users/dodeja/dev/t49/API

# Link to Vercel (if not already linked)
vercel link

# Select or create project
# Choose: Terminal49/API
```

#### Step 3: Configure Git Integration

**Via Vercel Dashboard**:

1. Go to your project: https://vercel.com/[your-team]/terminal49-api
2. Click **Settings** → **Git**
3. Verify settings:

```
✅ Production Branch: master
✅ Preview Deployments: Enabled
✅ Ignored Build Step: (empty)
✅ Root Directory: ./
```

**Via Vercel CLI**:

```bash
# Check current settings
vercel git

# Example output:
# Production Branch: master
# Preview: Enabled for all branches
```

---

## 🚀 How Preview Deployments Work

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Developer pushes to branch: feature/mcp-phase-1            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  GitHub triggers webhook to Vercel                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Vercel automatically:                                      │
│  1. Detects branch is not "master"                         │
│  2. Runs build: cd mcp-ts && npm install && npm run build │
│  3. Deploys to preview URL                                 │
│  4. Posts comment on PR with deployment URL                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Preview URL available:                                     │
│  https://terminal49-api-git-feature-mcp-phase-1-team.vercel.app
└─────────────────────────────────────────────────────────────┘
```

### On Every Push

```bash
git push origin feature/mcp-phase-1

# Vercel automatically:
# ✅ Builds the branch
# ✅ Creates preview deployment
# ✅ Posts comment with URL (if PR exists)
```

### On PR Creation

When you create a PR:

```bash
gh pr create \
  --title "Upgrade Terminal49 MCP Server to SDK v1.20.1" \
  --body-file PR_DESCRIPTION.md
```

**Vercel Bot Comments**:
```
🔗 Preview deployment ready!

✅ Preview: https://terminal49-api-git-feature-mcp-phase-1-team.vercel.app

📊 Deployment Details:
- Branch: feature/mcp-phase-1
- Commit: 84aeafa
- Built in: 45s
```

---

## 🧪 Testing Preview Deployments

### 1. Create a Test PR

```bash
# Push your branch
git push origin feature/mcp-phase-1

# Create PR
gh pr create \
  --title "Test: MCP Preview Deployment" \
  --body "Testing automatic preview deployments"
```

### 2. Check Vercel Dashboard

Go to: https://vercel.com/[your-team]/terminal49-api

**You should see**:
- **Production** deployment (from `master`)
- **Preview** deployment (from `feature/mcp-phase-1`)

### 3. Wait for Deployment

Typical timeline:
```
Push → Build starts (5-10s)
     → npm install (20-30s)
     → npm run build (10-15s)
     → Deploy (5-10s)
     → Total: ~45-60 seconds
```

### 4. Test the Preview URL

Once deployed, test both endpoints:

```bash
# Get preview URL from PR comment or Vercel dashboard
PREVIEW_URL="https://terminal49-api-git-feature-mcp-phase-1-team.vercel.app"

# Test HTTP endpoint
curl -X POST $PREVIEW_URL/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test SSE endpoint
curl -N $PREVIEW_URL/sse \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔍 Verifying Preview Setup

### Check 1: GitHub App Installed

```bash
# Check if Vercel app is installed
curl -H "Authorization: token YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/Terminal49/API/hooks

# Look for "vercel" in the response
```

### Check 2: Vercel Project Settings

**Via Dashboard**:
1. Go to https://vercel.com/[your-team]/terminal49-api/settings/git
2. Verify:
   - ✅ Git Repository: Terminal49/API
   - ✅ Production Branch: master
   - ✅ Preview Deployments: On

**Via CLI**:
```bash
vercel project ls

# Should show your project with Git integration
```

### Check 3: Environment Variables

**Important**: Preview deployments need environment variables!

```bash
# Check which environments have T49_API_TOKEN
vercel env ls

# Should show:
# T49_API_TOKEN  Production, Preview, Development
```

**If missing for Preview**:
```bash
vercel env add T49_API_TOKEN preview
# Enter your token
```

---

## 🎨 Customizing Preview Deployments

### Configure in vercel.json

```json
{
  "git": {
    "deploymentEnabled": {
      "master": true,
      "feature/*": true,
      "all": true
    }
  },
  "github": {
    "autoAlias": true,
    "silent": false,
    "autoJobCancelation": true
  }
}
```

**Options**:
- `autoAlias`: Create predictable URLs
- `silent`: Disable PR comments
- `autoJobCancelation`: Cancel old builds when new push happens

### Ignore Specific Branches

Add to `vercel.json`:
```json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "preview/*": true,
      "feature/*": true,
      "hotfix/*": false,
      "dependabot/*": false
    }
  }
}
```

### Custom Build Commands per Branch

```json
{
  "build": {
    "env": {
      "NODE_ENV": "preview"
    }
  }
}
```

---

## 📝 Preview Deployment URLs

### URL Patterns

Vercel creates predictable URLs:

**Format**:
```
https://[project-name]-git-[branch-name]-[team-name].vercel.app
```

**Examples**:
```
# Production (master)
https://terminal49-api.vercel.app

# Preview (feature/mcp-phase-1)
https://terminal49-api-git-feature-mcp-phase-1-terminal49.vercel.app

# Preview (fix/bug-123)
https://terminal49-api-git-fix-bug-123-terminal49.vercel.app
```

### Accessing Specific Deployment

```bash
# List all deployments
vercel ls

# Get URL for specific deployment
vercel inspect [deployment-id]
```

---

## 🔒 Security Considerations

### Environment Variables

**Best Practice**: Use different tokens for preview vs production

```bash
# Production token
vercel env add T49_API_TOKEN production
# Enter production token

# Preview/staging token (with limited permissions)
vercel env add T49_API_TOKEN preview
# Enter preview token
```

### Preview Deployment Protection

**Option 1**: Password protect previews

In Vercel Dashboard:
1. Settings → Deployment Protection
2. Enable "Password Protection for Preview Deployments"
3. Set password

**Option 2**: Vercel Authentication

1. Settings → Deployment Protection
2. Enable "Vercel Authentication"
3. Only team members can access previews

---

## 🐛 Troubleshooting

### Issue: No Preview Deployment Created

**Symptoms**: Push to branch but no deployment

**Solutions**:

1. **Check GitHub App is installed**:
   ```bash
   # Go to: https://github.com/apps/vercel
   # Verify access to Terminal49/API
   ```

2. **Check branch isn't ignored**:
   ```bash
   # In vercel.json, ensure branch patterns allow your branch
   ```

3. **Check build doesn't fail**:
   ```bash
   # View logs: vercel logs --follow
   ```

4. **Manually trigger**:
   ```bash
   vercel --force
   ```

### Issue: Preview URL 404

**Causes**:
- Build failed
- Wrong root directory
- Missing files

**Solutions**:

1. **Check build logs**:
   ```bash
   vercel logs [deployment-url]
   ```

2. **Verify build succeeds locally**:
   ```bash
   cd mcp-ts
   npm install
   npm run build
   # Should complete without errors
   ```

3. **Check vercel.json configuration**:
   ```json
   {
     "buildCommand": "cd mcp-ts && npm install && npm run build",
     "outputDirectory": "mcp-ts/dist"
   }
   ```

### Issue: Environment Variables Missing

**Symptoms**: 401 Unauthorized on preview

**Solution**:
```bash
# Ensure T49_API_TOKEN set for preview
vercel env add T49_API_TOKEN preview

# Pull environment variables
vercel env pull .env.preview
```

### Issue: Preview Comment Not Posted

**Causes**:
- Vercel bot doesn't have PR access
- Silent mode enabled

**Solutions**:

1. **Grant bot access**:
   - Go to GitHub repo settings
   - Integrations → Vercel
   - Ensure "Read & Write" access to Pull Requests

2. **Disable silent mode** in vercel.json:
   ```json
   {
     "github": {
       "silent": false
     }
   }
   ```

---

## 📊 Monitoring Preview Deployments

### Vercel Dashboard

**Real-time monitoring**:
1. Go to https://vercel.com/[your-team]/terminal49-api
2. Click "Deployments" tab
3. See all preview + production deployments

**Deployment Details**:
- Build logs
- Function logs
- Performance metrics
- Error rates

### CLI Monitoring

```bash
# List recent deployments
vercel ls

# Follow logs for preview
vercel logs --follow [preview-url]

# Check deployment status
vercel inspect [deployment-url]
```

### GitHub Status Checks

Vercel adds status checks to PRs:

```
✅ Deployment successful — Preview ready
❌ Deployment failed — View logs
⏳ Deployment in progress...
```

---

## ✅ Verification Checklist

Use this checklist to verify preview deployments are working:

- [ ] **GitHub App Installed**: Vercel app has access to Terminal49/API
- [ ] **Project Linked**: `vercel link` completed successfully
- [ ] **Git Integration**: Settings → Git shows repository connected
- [ ] **Production Branch**: Set to `master`
- [ ] **Preview Deployments**: Enabled for all branches
- [ ] **Environment Variables**: T49_API_TOKEN set for Preview
- [ ] **Build Command**: `cd mcp-ts && npm install && npm run build`
- [ ] **Test Push**: Push to branch creates deployment
- [ ] **Test PR**: Creating PR posts comment with URL
- [ ] **Test URL**: Preview URL responds to requests
- [ ] **Test Endpoints**: Both /mcp and /sse work

---

## 🎯 Expected Behavior

### When You Push to Branch

```bash
git push origin feature/mcp-phase-1

# Within 60 seconds:
# ✅ Vercel receives webhook
# ✅ Build starts automatically
# ✅ Preview deployment created
# ✅ URL available in Vercel dashboard
```

### When You Create PR

```bash
gh pr create --title "..." --body "..."

# Within 60 seconds:
# ✅ Vercel bot comments on PR
# ✅ Comment includes preview URL
# ✅ Status check added to PR
# ✅ Can click URL to test immediately
```

### When You Update PR

```bash
git push origin feature/mcp-phase-1

# Within 60 seconds:
# ✅ New preview deployment created
# ✅ Old preview deployment kept (for rollback)
# ✅ Vercel bot updates PR comment
# ✅ Status check updated
```

---

## 🚀 Quick Start

**TL;DR - Get preview deployments in 3 steps:**

```bash
# 1. Link project (if not already done)
vercel link

# 2. Set environment variables for preview
vercel env add T49_API_TOKEN preview

# 3. Push to branch
git push origin feature/mcp-phase-1
```

**Done!** Preview deployment will be created automatically.

Check: https://vercel.com/[your-team]/terminal49-api/deployments

---

## 📚 Additional Resources

- **Vercel Git Integration**: https://vercel.com/docs/concepts/git
- **Preview Deployments**: https://vercel.com/docs/concepts/deployments/preview-deployments
- **Environment Variables**: https://vercel.com/docs/concepts/projects/environment-variables
- **Deployment Protection**: https://vercel.com/docs/security/deployment-protection

---

**Questions?** Check Vercel dashboard or run `vercel help git`
