# OAuth 2.1 Implementation Plan for Terminal49 MCP Server

This document outlines the implementation plan for adding OAuth 2.1 authorization to the Terminal49 MCP Server, enabling seamless authorization when users add the MCP server to tools like Claude Desktop.

## Table of Contents

- [Overview](#overview)
- [Current State Analysis](#current-state-analysis)
- [MCP OAuth 2.1 Requirements](#mcp-oauth-21-requirements)
- [Plan 1: Terminal49 Rails Repository](#plan-1-terminal49-rails-repository)
- [Plan 2: MCP Server Repository](#plan-2-mcp-server-repository)
- [Authorization Flow](#authorization-flow)
- [Testing Strategy](#testing-strategy)
- [Security Considerations](#security-considerations)

---

## Overview

**Goal**: When a user adds the Terminal49 MCP server to Claude Desktop (or any MCP client), automatically trigger an OAuth 2.1 authorization workflow that allows the user to authorize MCP access through their Terminal49 account.

**Benefits**:
- Seamless user experience (no manual API key copying)
- User-scoped authorization (tokens tied to specific accounts)
- Revocable access (users can revoke MCP tokens from dashboard)
- Standards-compliant (OAuth 2.1 with PKCE)

---

## Current State Analysis

### Terminal49's Existing Auth System

**Location**: `/Users/dodeja/dev/t49/t49/apps/tnt-api`

- **Authentication**: Email + verification code flow (not OAuth)
- **Tokens**:
  - JWT access tokens (1-day expiry) via `user.rb:152-154`
  - Refresh tokens (30-day expiry) stored in database
  - API keys (long-lived) stored in `api_keys` table
- **Authorization Schemes**: Supports both `Token` and `Bearer` (v2/api_base_controller.rb:29)
- **Permissions**: Account-scoped with flags (`data_out_api`, `api_access_paused`)
- **Controllers**:
  - `v1/auths_controller.rb` - Login, create, refresh endpoints
  - `v2/api_base_controller.rb` - Token validation for API requests

### MCP Server Current State

**Location**: `/Users/dodeja/dev/t49/API`

- **Endpoint**: `api/mcp.ts` accepts Bearer tokens but doesn't validate them
- **Client**: Uses `Terminal49Client` which requires T49 API token
- **Issue**: No token validation against Terminal49 API
- **Deployment**: Vercel serverless functions

---

## MCP OAuth 2.1 Requirements

Based on the MCP specification updates from March/June 2025:

### Core Requirements

1. **MCP Servers as OAuth 2.1 Resource Servers**
   - Validate Bearer tokens on every request
   - Return HTTP 401 with `WWW-Authenticate` header when unauthorized
   - Include authorization server metadata discovery

2. **Authorization Server Metadata** (RFC 8414)
   - Discovery endpoint: `/.well-known/oauth-authorization-server`
   - Advertises authorization/token endpoints
   - Specifies supported grant types and challenge methods

3. **PKCE Required** (OAuth 2.1)
   - All authorization flows MUST use PKCE (Proof Key for Code Exchange)
   - Code challenge method: `S256` (SHA-256)
   - Prevents authorization code interception attacks

4. **Authorization Code Flow**
   - User redirected to authorization endpoint
   - User authenticates and grants consent
   - Authorization code issued (short-lived, 10 minutes)
   - Client exchanges code + verifier for access token

---

## Plan 1: Terminal49 Rails Repository

**Location**: `/Users/dodeja/dev/t49/t49/apps/tnt-api`

### 1. Database Schema Changes

#### Migration 1: Add OAuth fields to api_keys

**File**: `db/migrate/YYYYMMDDHHMMSS_add_oauth_to_api_keys.rb`

```ruby
class AddOauthToApiKeys < ActiveRecord::Migration[7.0]
  def change
    add_column :api_keys, :oauth_client_id, :string
    add_column :api_keys, :oauth_scopes, :text, array: true, default: []
    add_index :api_keys, :oauth_client_id
  end
end
```

**Purpose**: Track which OAuth client created each API key, and what scopes were granted.

#### Migration 2: Create oauth_authorization_codes table

**File**: `db/migrate/YYYYMMDDHHMMSS_create_oauth_authorization_codes.rb`

```ruby
class CreateOauthAuthorizationCodes < ActiveRecord::Migration[7.0]
  def change
    create_table :oauth_authorization_codes, id: :uuid do |t|
      t.string :code, null: false
      t.string :client_id, null: false
      t.string :redirect_uri, null: false
      t.string :code_challenge, null: false
      t.string :code_challenge_method, default: 'S256', null: false
      t.uuid :user_id, null: false
      t.uuid :account_id, null: false
      t.datetime :expires_at, null: false
      t.datetime :used_at
      t.timestamps
    end

    add_index :oauth_authorization_codes, :code, unique: true
    add_index :oauth_authorization_codes, :user_id
    add_index :oauth_authorization_codes, :expires_at
  end
end
```

**Purpose**: Store short-lived authorization codes issued during OAuth flow.

**Fields**:
- `code` - Random authorization code (32 bytes, URL-safe)
- `code_challenge` - SHA-256 hash of code_verifier (PKCE)
- `expires_at` - 10 minutes from creation
- `used_at` - Prevents code reuse attacks

---

### 2. Models

#### OauthAuthorizationCode Model

**File**: `app/models/oauth_authorization_code.rb`

```ruby
class OauthAuthorizationCode < ApplicationRecord
  belongs_to :user
  belongs_to :account

  validates :code, :client_id, :redirect_uri, :code_challenge, presence: true

  scope :valid, -> { where('expires_at > ? AND used_at IS NULL', Time.current) }

  def self.generate_code
    SecureRandom.urlsafe_base64(32)
  end

  def expired?
    expires_at < Time.current
  end

  def used?
    used_at.present?
  end

  def mark_as_used!
    update!(used_at: Time.current)
  end

  def verify_challenge(code_verifier)
    # PKCE verification: SHA-256(code_verifier) must equal code_challenge
    challenge = Base64.urlsafe_encode64(
      Digest::SHA256.digest(code_verifier),
      padding: false
    )
    code_challenge == challenge
  end
end
```

**Key Methods**:
- `verify_challenge` - Validates PKCE code_verifier against stored code_challenge
- `mark_as_used!` - Prevents authorization code reuse

---

### 3. Controllers

#### Well-Known Controller (Discovery)

**File**: `app/controllers/oauth/well_known_controller.rb`

```ruby
class Oauth::WellKnownController < ActionController::API
  def authorization_server
    render json: {
      issuer: ENV.fetch('OAUTH_ISSUER', 'https://api.terminal49.com'),
      authorization_endpoint: "#{ENV.fetch('WEB_APP_URL', 'https://app.terminal49.com')}/oauth/authorize",
      token_endpoint: "#{ENV.fetch('API_URL', 'https://api.terminal49.com')}/oauth/token",
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], # Public client (PKCE)
      scopes_supported: ['read', 'write']
    }
  end
end
```

**Purpose**: RFC 8414 Authorization Server Metadata endpoint for MCP client discovery.

---

#### Authorizations Controller (Consent Screen)

**File**: `app/controllers/oauth/authorizations_controller.rb`

```ruby
class Oauth::AuthorizationsController < ApplicationController
  before_action :authenticate_request! # Requires user to be logged in

  ALLOWED_CLIENTS = {
    'claude-desktop' => {
      name: 'Claude Desktop',
      redirect_uris: ['http://localhost:3000/callback', 'http://127.0.0.1:3000/callback']
    },
    'mcp-client' => {
      name: 'MCP Client',
      redirect_uris: ['http://localhost:*/callback', 'http://127.0.0.1:*/callback']
    }
  }.freeze

  def new
    # Validate OAuth parameters
    @client_id = params[:client_id]
    @redirect_uri = params[:redirect_uri]
    @code_challenge = params[:code_challenge]
    @code_challenge_method = params[:code_challenge_method] || 'S256'
    @state = params[:state]

    # Validate client
    @client = ALLOWED_CLIENTS[@client_id]
    unless @client
      render json: { error: 'invalid_client' }, status: :bad_request
      return
    end

    # Validate redirect URI
    unless valid_redirect_uri?(@redirect_uri, @client[:redirect_uris])
      render json: { error: 'invalid_redirect_uri' }, status: :bad_request
      return
    end

    # Validate PKCE
    unless @code_challenge.present? && @code_challenge_method == 'S256'
      render json: { error: 'invalid_request', error_description: 'PKCE required' }, status: :bad_request
      return
    end

    # Render consent screen (or auto-approve for trusted clients)
    # For now, auto-approve for Terminal49-owned clients
    create
  end

  def create
    # Generate authorization code
    code = OauthAuthorizationCode.create!(
      code: OauthAuthorizationCode.generate_code,
      client_id: params[:client_id],
      redirect_uri: params[:redirect_uri],
      code_challenge: params[:code_challenge],
      code_challenge_method: params[:code_challenge_method] || 'S256',
      user_id: current_user.id,
      account_id: current_account.id,
      expires_at: 10.minutes.from_now
    )

    # Redirect with authorization code
    redirect_uri = URI.parse(params[:redirect_uri])
    redirect_uri.query = URI.encode_www_form({
      code: code.code,
      state: params[:state]
    }.compact)

    redirect_to redirect_uri.to_s, allow_other_host: true
  end

  private

  def valid_redirect_uri?(uri, allowed_patterns)
    allowed_patterns.any? do |pattern|
      if pattern.include?('*')
        # Simple wildcard matching for localhost with any port
        regex = Regexp.new("^#{Regexp.escape(pattern).gsub('\*', '.*')}$")
        uri.match?(regex)
      else
        uri == pattern
      end
    end
  end
end
```

**Key Features**:
- Validates OAuth parameters (client_id, redirect_uri, code_challenge)
- Requires PKCE (code_challenge_method = S256)
- Auto-approves for trusted first-party clients
- Generates and stores authorization code
- Redirects back to client with code

---

#### Tokens Controller (Token Exchange)

**File**: `app/controllers/oauth/tokens_controller.rb`

```ruby
class Oauth::TokensController < ActionController::API
  def create
    grant_type = params[:grant_type]

    case grant_type
    when 'authorization_code'
      handle_authorization_code_grant
    else
      render json: {
        error: 'unsupported_grant_type',
        error_description: "Grant type '#{grant_type}' not supported"
      }, status: :bad_request
    end
  end

  private

  def handle_authorization_code_grant
    code = params[:code]
    code_verifier = params[:code_verifier]
    redirect_uri = params[:redirect_uri]

    # Find authorization code
    auth_code = OauthAuthorizationCode.valid.find_by(code: code)

    unless auth_code
      render json: { error: 'invalid_grant' }, status: :bad_request
      return
    end

    # Verify not expired
    if auth_code.expired?
      render json: { error: 'invalid_grant', error_description: 'Code expired' }, status: :bad_request
      return
    end

    # Verify not already used
    if auth_code.used?
      render json: { error: 'invalid_grant', error_description: 'Code already used' }, status: :bad_request
      return
    end

    # Verify redirect URI matches
    unless auth_code.redirect_uri == redirect_uri
      render json: { error: 'invalid_grant', error_description: 'Redirect URI mismatch' }, status: :bad_request
      return
    end

    # Verify PKCE challenge
    unless auth_code.verify_challenge(code_verifier)
      render json: { error: 'invalid_grant', error_description: 'Invalid code verifier' }, status: :bad_request
      return
    end

    # Mark code as used
    auth_code.mark_as_used!

    # Find or create API key for MCP access
    account = auth_code.account
    api_key = account.api_keys.find_or_create_by!(
      oauth_client_id: auth_code.client_id,
      user_id: auth_code.user_id,
      disabled_at: nil
    ) do |key|
      key.name = "MCP Access (#{auth_code.client_id})"
      key.oauth_scopes = ['read']
    end

    # Return access token
    render json: {
      access_token: api_key.token,
      token_type: 'Bearer',
      scope: 'read',
      account_id: account.id
    }
  end
end
```

**Key Security Checks**:
1. Authorization code exists and is valid
2. Code not expired (10 minute window)
3. Code not already used (prevents replay attacks)
4. Redirect URI matches original request
5. PKCE code_verifier verifies against code_challenge

**Token Issuance**:
- Reuses existing `api_keys` table
- Creates or finds API key for OAuth client
- Returns long-lived Bearer token

---

### 4. Routes

**File**: `config/routes.rb`

Add after line 1:

```ruby
# OAuth 2.1 endpoints
namespace :oauth do
  get '.well-known/oauth-authorization-server', to: 'well_known#authorization_server'
  get 'authorize', to: 'authorizations#new'
  post 'authorize', to: 'authorizations#create'
  post 'token', to: 'tokens#create'
end
```

**Resulting Endpoints**:
- `GET /.well-known/oauth-authorization-server` - Discovery metadata
- `GET /oauth/authorize` - Authorization endpoint (shows consent screen)
- `POST /oauth/authorize` - Creates authorization code
- `POST /oauth/token` - Token exchange endpoint

---

### 5. Environment Variables

**File**: `.env.example` (add these)

```bash
# OAuth Configuration
OAUTH_ISSUER=https://api.terminal49.com
WEB_APP_URL=https://app.terminal49.com
API_URL=https://api.terminal49.com
```

**Purpose**:
- `OAUTH_ISSUER` - Identifies the authorization server
- `WEB_APP_URL` - Where authorization/consent screen is hosted
- `API_URL` - Where token endpoint is hosted

---

## Plan 2: MCP Server Repository

**Location**: `/Users/dodeja/dev/t49/API`

### 1. Token Validation Module

**File**: `mcp-ts/src/auth/token-validator.ts`

```typescript
import { Terminal49Client } from '../client.js';

export interface TokenValidationResult {
  valid: boolean;
  accountId?: string;
  userId?: string;
  error?: string;
}

export class TokenValidator {
  /**
   * Validates a Bearer token against Terminal49 API
   * Makes a lightweight API call to verify the token is valid
   */
  static async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const client = new Terminal49Client({
        apiToken: token,
        apiBaseUrl: process.env.T49_API_BASE_URL
      });

      // Make a lightweight request to validate token
      // Using /v2/shipping_lines as a test endpoint (small response)
      const response = await client.request('/v2/shipping_lines', {
        method: 'GET',
        params: { 'page[size]': '1' }
      });

      // If we got here, token is valid
      // Extract account info from response headers if available
      return {
        valid: true,
        // Account ID would come from response if T49 API returns it
        // For now, we just validate the token works
      };
    } catch (error: any) {
      if (error.statusCode === 401) {
        return {
          valid: false,
          error: 'invalid_token'
        };
      }

      // Other errors might be network issues, not necessarily invalid token
      return {
        valid: false,
        error: 'validation_failed'
      };
    }
  }
}
```

**How it works**:
1. Creates a Terminal49Client with the provided token
2. Makes a lightweight API request (shipping_lines with limit=1)
3. If request succeeds → token is valid
4. If 401 error → token is invalid
5. Other errors → validation inconclusive

**Trade-offs**:
- Pro: Simple, reuses existing client
- Pro: No need to parse/decode tokens
- Con: Extra API call on every MCP request
- Future: Could cache validation results for 5 minutes

---

### 2. Update MCP Endpoint

**File**: `api/mcp.ts`

**Add import** at top:
```typescript
import { TokenValidator } from '../mcp-ts/src/auth/token-validator.js';
```

**Replace lines 34-50** with:

```typescript
try {
  // Extract API token from Authorization header
  const authHeader = req.headers.authorization;
  let apiToken: string;

  if (authHeader?.startsWith('Bearer ')) {
    apiToken = authHeader.substring(7);

    // Validate token against Terminal49 API
    const validation = await TokenValidator.validateToken(apiToken);

    if (!validation.valid) {
      // Return OAuth 2.1 error response with WWW-Authenticate header
      const wwwAuthenticate = [
        'Bearer realm="terminal49-mcp"',
        'error="invalid_token"',
        validation.error === 'invalid_token'
          ? 'error_description="The access token is invalid or expired"'
          : 'error_description="Token validation failed"'
      ].join(', ');

      res.setHeader('WWW-Authenticate', wwwAuthenticate);
      res.setHeader('Link', '</.well-known/oauth-authorization-server>; rel="oauth-authorization-server"');

      res.status(401).json({
        error: 'invalid_token',
        error_description: validation.error === 'invalid_token'
          ? 'The access token is invalid or expired'
          : 'Token validation failed'
      });
      return;
    }
  } else if (authHeader?.startsWith('Token ')) {
    // Support legacy Token scheme for backward compatibility
    apiToken = authHeader.substring(6);
  } else if (process.env.T49_API_TOKEN) {
    // Fallback to environment variable (development only)
    apiToken = process.env.T49_API_TOKEN;
  } else {
    // No token provided - return OAuth 2.1 challenge
    const wwwAuthenticate = 'Bearer realm="terminal49-mcp"';
    res.setHeader('WWW-Authenticate', wwwAuthenticate);
    res.setHeader('Link', '</.well-known/oauth-authorization-server>; rel="oauth-authorization-server"');

    res.status(401).json({
      error: 'invalid_request',
      error_description: 'Missing Authorization header'
    });
    return;
  }
```

**Key Changes**:
1. Validates Bearer tokens using `TokenValidator`
2. Returns proper OAuth 2.1 error responses with `WWW-Authenticate` header
3. Includes `Link` header pointing to discovery endpoint
4. Maintains backward compatibility with `Token` scheme
5. Fallback to environment variable for development

**OAuth 2.1 Compliance**:
- `WWW-Authenticate` header format per RFC 6750
- Error codes: `invalid_token`, `invalid_request`
- Discovery link per MCP specification

---

### 3. OAuth Discovery Endpoint

**File**: `api/oauth/well-known.ts`

```typescript
/**
 * OAuth 2.1 Authorization Server Metadata Endpoint
 * RFC 8414: OAuth 2.0 Authorization Server Metadata
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiUrl = process.env.API_URL || 'https://api.terminal49.com';
  const webAppUrl = process.env.WEB_APP_URL || 'https://app.terminal49.com';

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.status(200).json({
    issuer: apiUrl,
    authorization_endpoint: `${webAppUrl}/oauth/authorize`,
    token_endpoint: `${apiUrl}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['read']
  });
}
```

**Purpose**: Allows MCP clients to discover authorization server endpoints automatically.

**Flow**:
1. MCP client receives 401 with `Link: </.well-known/oauth-authorization-server>`
2. Client fetches this endpoint
3. Client learns where to send user for authorization
4. Client learns where to exchange code for token

---

### 4. Update Vercel Configuration

**File**: `vercel.json`

Add to `rewrites` array:

```json
{
  "rewrites": [
    {"source": "/mcp", "destination": "/api/mcp"},
    {"source": "/sse", "destination": "/api/sse"},
    {"source": "/.well-known/oauth-authorization-server", "destination": "/api/oauth/well-known"}
  ]
}
```

**Purpose**: Routes discovery endpoint to serverless function.

---

### 5. Update Environment Variables

**File**: `.env.sample`

```bash
# Terminal49 MCP Server - Environment Variables
# Copy this file to .env.local and fill in your credentials

# Terminal49 API Token (for development/testing only)
# In production, tokens come from OAuth flow
T49_API_TOKEN=your_api_token_here

# Terminal49 API Base URL (optional)
# Default: https://api.terminal49.com
T49_API_BASE_URL=https://api.terminal49.com/v2

# OAuth Configuration (production)
API_URL=https://api.terminal49.com
WEB_APP_URL=https://app.terminal49.com
```

**New Variables**:
- `API_URL` - Terminal49 API base (for discovery metadata)
- `WEB_APP_URL` - Terminal49 web app (for authorization page)

---

### 6. Update Documentation

**File**: `mcp-ts/README.md`

Add new section:

```markdown
## OAuth 2.1 Authorization

The Terminal49 MCP Server supports OAuth 2.1 authorization for seamless integration with MCP clients like Claude Desktop.

### Authorization Flow

1. **Discovery**: MCP clients discover authorization server via `/.well-known/oauth-authorization-server`
2. **Authorization**: User is redirected to Terminal49 web app to approve access
3. **Token Exchange**: Client exchanges authorization code for API token using PKCE
4. **API Access**: Client includes `Authorization: Bearer <token>` in all MCP requests

### Manual Testing

```bash
# 1. Start OAuth flow (in browser)
open "https://app.terminal49.com/oauth/authorize?client_id=claude-desktop&redirect_uri=http://localhost:3000/callback&code_challenge=YOUR_CHALLENGE&code_challenge_method=S256&response_type=code"

# 2. Exchange code for token
curl -X POST https://api.terminal49.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTHORIZATION_CODE",
    "redirect_uri": "http://localhost:3000/callback",
    "code_verifier": "YOUR_VERIFIER"
  }'

# 3. Use token with MCP
curl -X POST https://api-mcp.terminal49.com/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Claude Desktop Configuration

Add to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://api-mcp.terminal49.com/mcp",
      "oauth": {
        "authorizationUrl": "https://app.terminal49.com/oauth/authorize",
        "tokenUrl": "https://api.terminal49.com/oauth/token",
        "clientId": "claude-desktop",
        "scopes": ["read"]
      }
    }
  }
}
```

### Development Mode

For local development, you can still use API tokens directly:

```json
{
  "mcpServers": {
    "terminal49": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "T49_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```
```

---

## Authorization Flow

### Complete End-to-End Flow

```
┌─────────────────┐                                    ┌─────────────────┐
│                 │                                    │                 │
│  Claude Desktop │                                    │ Terminal49 MCP  │
│   (MCP Client)  │                                    │     Server      │
│                 │                                    │                 │
└────────┬────────┘                                    └────────┬────────┘
         │                                                      │
         │ 1. POST /mcp (no Authorization header)              │
         │─────────────────────────────────────────────────────>│
         │                                                      │
         │ 2. HTTP 401 Unauthorized                            │
         │    WWW-Authenticate: Bearer realm="terminal49-mcp"  │
         │    Link: </.well-known/oauth-authorization-server>  │
         │<─────────────────────────────────────────────────────│
         │                                                      │
         │ 3. GET /.well-known/oauth-authorization-server      │
         │─────────────────────────────────────────────────────>│
         │                                                      │
         │ 4. Authorization Server Metadata (JSON)             │
         │    { authorization_endpoint, token_endpoint, ... }  │
         │<─────────────────────────────────────────────────────│
         │                                                      │
         │                                                      │
    ┌────┴────┐                                                 │
    │         │ 5. Generate PKCE verifier & challenge           │
    │  PKCE   │    verifier = random(43-128 chars)             │
    │         │    challenge = base64(sha256(verifier))        │
    └────┬────┘                                                 │
         │                                                      │
         │ 6. Open browser with authorization URL              │
         │    https://app.terminal49.com/oauth/authorize?      │
         │      client_id=claude-desktop&                      │
         │      redirect_uri=http://localhost:3000/callback&   │
         │      code_challenge=CHALLENGE&                      │
         │      code_challenge_method=S256&                    │
         │      response_type=code&                            │
         │      state=RANDOM_STATE                             │
         │                                                      │
         ▼                                                      │
┌──────────────────┐                                            │
│                  │                                            │
│  User's Browser  │                                            │
│                  │                                            │
└────────┬─────────┘                                            │
         │                                                      │
         │ 7. User authenticates (if not logged in)            │
         │    User sees: "Claude Desktop wants to access..."   │
         │    User clicks "Authorize"                          │
         │                                                      │
         │ 8. Redirect to callback with authorization code     │
         │    http://localhost:3000/callback?                  │
         │      code=AUTH_CODE&                                │
         │      state=RANDOM_STATE                             │
         │                                                      │
         ▼                                                      │
┌─────────────────┐                                             │
│                 │                                             │
│  Claude Desktop │                                             │
│   (callback)    │                                             │
│                 │                                             │
└────────┬────────┘                                             │
         │                                                      │
         │ 9. POST /oauth/token                                │
         │    {                                                │
         │      grant_type: "authorization_code",              │
         │      code: "AUTH_CODE",                             │
         │      redirect_uri: "http://localhost:3000/callback",│
         │      code_verifier: "VERIFIER"                      │
         │    }                                                │
         │                                                      │
         ├──────────────────────────────────────────┐          │
         │                                          │          │
         │                                          ▼          │
         │                              ┌────────────────────┐ │
         │                              │                    │ │
         │                              │  Terminal49 API    │ │
         │                              │  (Rails Backend)   │ │
         │                              │                    │ │
         │                              └─────────┬──────────┘ │
         │                                        │            │
         │ 10. Validates:                         │            │
         │     - Code exists and not expired      │            │
         │     - Code not already used            │            │
         │     - Redirect URI matches             │            │
         │     - PKCE: sha256(verifier) == stored │            │
         │       challenge                        │            │
         │                                        │            │
         │ 11. Creates/finds API key              │            │
         │     Marks code as used                 │            │
         │                                        │            │
         │ 12. Returns access token               │            │
         │     {                                  │            │
         │       access_token: "abc123...",       │            │
         │       token_type: "Bearer",            │            │
         │       scope: "read",                   │            │
         │       account_id: "uuid"               │            │
         │     }                                  │            │
         │<───────────────────────────────────────┘            │
         │                                                      │
         │ 13. POST /mcp                                       │
         │     Authorization: Bearer abc123...                 │
         │     { "jsonrpc": "2.0", "method": "tools/list" }   │
         │─────────────────────────────────────────────────────>│
         │                                                      │
         │                                    14. Validates     │
         │                                        token         │
         │                                                      │
         │ 15. MCP response                                    │
         │     { "result": { "tools": [...] } }                │
         │<─────────────────────────────────────────────────────│
         │                                                      │
```

---

## Testing Strategy

### 1. Manual Testing (OAuth Flow)

**Step 1: Generate PKCE parameters**

```bash
# Generate code_verifier (43-128 characters)
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=' | tr '+/' '-_')

# Generate code_challenge (SHA-256 of verifier, base64url encoded)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr -d '=' | tr '+/' '-_')

echo "Verifier: $CODE_VERIFIER"
echo "Challenge: $CODE_CHALLENGE"
```

**Step 2: Start authorization flow**

```bash
# Open browser (replace CODE_CHALLENGE)
open "https://app.terminal49.com/oauth/authorize?client_id=claude-desktop&redirect_uri=http://localhost:3000/callback&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256&response_type=code&state=random123"
```

**Step 3: Exchange code for token**

```bash
# After authorization, you'll get redirected with a code
# Extract the code and run:

curl -X POST https://api.terminal49.com/oauth/token \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"authorization_code\",
    \"code\": \"YOUR_AUTH_CODE\",
    \"redirect_uri\": \"http://localhost:3000/callback\",
    \"code_verifier\": \"$CODE_VERIFIER\"
  }"
```

**Step 4: Test MCP with token**

```bash
# Use the returned access_token
curl -X POST https://api-mcp.terminal49.com/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

### 2. Automated Tests (Rails)

**Test OAuth Authorization Codes**

```ruby
# spec/models/oauth_authorization_code_spec.rb
RSpec.describe OauthAuthorizationCode do
  describe '#verify_challenge' do
    it 'validates PKCE code_verifier' do
      verifier = 'test_verifier_12345678901234567890123456789012'
      challenge = Base64.urlsafe_encode64(
        Digest::SHA256.digest(verifier),
        padding: false
      )

      code = create(:oauth_authorization_code, code_challenge: challenge)
      expect(code.verify_challenge(verifier)).to be true
    end

    it 'rejects invalid code_verifier' do
      code = create(:oauth_authorization_code)
      expect(code.verify_challenge('wrong_verifier')).to be false
    end
  end

  describe '#expired?' do
    it 'returns true when expires_at is in the past' do
      code = create(:oauth_authorization_code, expires_at: 1.minute.ago)
      expect(code.expired?).to be true
    end
  end
end
```

**Test Token Controller**

```ruby
# spec/controllers/oauth/tokens_controller_spec.rb
RSpec.describe Oauth::TokensController do
  describe 'POST #create' do
    context 'with valid authorization code' do
      let(:user) { create(:user) }
      let(:account) { user.primary_account }
      let(:verifier) { 'test_verifier_12345678901234567890123456789012' }
      let(:challenge) { Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false) }
      let(:auth_code) do
        create(:oauth_authorization_code,
          user: user,
          account: account,
          code_challenge: challenge,
          expires_at: 10.minutes.from_now
        )
      end

      it 'returns access token' do
        post :create, params: {
          grant_type: 'authorization_code',
          code: auth_code.code,
          redirect_uri: auth_code.redirect_uri,
          code_verifier: verifier
        }

        expect(response).to have_http_status(:success)
        json = JSON.parse(response.body)
        expect(json['access_token']).to be_present
        expect(json['token_type']).to eq('Bearer')
      end

      it 'marks code as used' do
        post :create, params: {
          grant_type: 'authorization_code',
          code: auth_code.code,
          redirect_uri: auth_code.redirect_uri,
          code_verifier: verifier
        }

        expect(auth_code.reload.used?).to be true
      end
    end

    context 'with invalid code_verifier' do
      it 'returns invalid_grant error' do
        # Test invalid PKCE verifier
      end
    end

    context 'with expired code' do
      it 'returns invalid_grant error' do
        # Test expired authorization code
      end
    end
  end
end
```

---

### 3. Integration Tests (MCP Server)

**Test Token Validation**

```typescript
// mcp-ts/src/auth/token-validator.test.ts
import { TokenValidator } from './token-validator.js';

describe('TokenValidator', () => {
  it('validates valid token', async () => {
    const result = await TokenValidator.validateToken(process.env.VALID_TEST_TOKEN!);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid token', async () => {
    const result = await TokenValidator.validateToken('invalid_token_123');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_token');
  });
});
```

**Test MCP Endpoint Authorization**

```bash
# Test unauthorized request returns proper OAuth challenge
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  -i

# Expected response:
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer realm="terminal49-mcp"
# Link: </.well-known/oauth-authorization-server>; rel="oauth-authorization-server"
```

---

## Security Considerations

### 1. PKCE Protection

**Threat**: Authorization code interception
**Mitigation**: PKCE ensures only the client that initiated the flow can exchange the code for a token

**How it works**:
1. Client generates random `code_verifier` (43-128 chars)
2. Client computes `code_challenge` = SHA-256(code_verifier)
3. Authorization server stores `code_challenge`
4. Client must provide `code_verifier` when exchanging code
5. Server verifies SHA-256(provided_verifier) == stored_challenge

**Why it matters**: Even if attacker intercepts authorization code, they cannot exchange it without the verifier.

---

### 2. Authorization Code Security

**Properties**:
- **Short-lived**: 10 minutes expiration
- **Single-use**: Marked as used after exchange
- **Bound to redirect_uri**: Must match original request
- **Bound to client_id**: Cannot be used by different client

**Attack Prevention**:
- Code replay → Prevented by `used_at` check
- Code theft → Prevented by PKCE verification
- Wrong client → Prevented by client_id validation

---

### 3. Token Management

**API Token Properties**:
- Long-lived (no expiration currently)
- Account-scoped with permissions
- Can be revoked via Terminal49 dashboard
- Tracked in `api_keys` table with `last_used_at`

**Future Enhancements**:
- Token expiration (e.g., 90 days)
- Refresh token flow
- Token rotation on refresh

---

### 4. Redirect URI Validation

**Allowed Patterns**:
```ruby
'claude-desktop' => {
  redirect_uris: [
    'http://localhost:3000/callback',
    'http://127.0.0.1:3000/callback'
  ]
},
'mcp-client' => {
  redirect_uris: [
    'http://localhost:*/callback',   # Wildcard port
    'http://127.0.0.1:*/callback'
  ]
}
```

**Why wildcards**: MCP clients may use random ports for callback listener.

**Security**: Only localhost/127.0.0.1 allowed for desktop clients (no remote URLs).

---

### 5. Rate Limiting

**Recommendations**:
- Token endpoint: 5 requests/minute per IP
- Authorization endpoint: 10 requests/minute per user
- MCP endpoint: 100 requests/minute per token

**Implementation**: Use Rack::Attack or similar Rails middleware.

---

### 6. Audit Logging

**Track these events**:
- Authorization code generation (user_id, client_id, timestamp)
- Token exchange (code used, API key created)
- Failed token exchanges (invalid verifier, expired code)
- MCP requests (token used, endpoint called)

**Purpose**: Security monitoring and debugging.

---

## Summary

### Plan 1: Terminal49 Rails Repository

**Files to Create**:
1. `db/migrate/..._add_oauth_to_api_keys.rb` - Migration
2. `db/migrate/..._create_oauth_authorization_codes.rb` - Migration
3. `app/models/oauth_authorization_code.rb` - Model
4. `app/controllers/oauth/well_known_controller.rb` - Discovery endpoint
5. `app/controllers/oauth/authorizations_controller.rb` - Authorization/consent
6. `app/controllers/oauth/tokens_controller.rb` - Token exchange

**Files to Modify**:
1. `config/routes.rb` - Add OAuth routes
2. `.env.example` - Add OAuth config variables

---

### Plan 2: MCP Server Repository

**Files to Create**:
1. `mcp-ts/src/auth/token-validator.ts` - Token validation
2. `api/oauth/well-known.ts` - Discovery endpoint

**Files to Modify**:
1. `api/mcp.ts` - Add OAuth 2.1 token validation
2. `vercel.json` - Add discovery endpoint route
3. `.env.sample` - Add OAuth config variables
4. `mcp-ts/README.md` - Add OAuth documentation

---

## Next Steps

1. **Review Plans**: Confirm approach with team
2. **Rails Implementation**: Create migrations, models, controllers
3. **MCP Implementation**: Add token validation, discovery endpoint
4. **Testing**: Manual OAuth flow testing
5. **Documentation**: Update developer docs
6. **Deployment**: Deploy to staging, test end-to-end
7. **Production**: Deploy to production with monitoring

---

## Questions & Design Decisions

### Decided:

1. ✅ **Reuse existing api_keys table** - Add OAuth fields instead of new token type
2. ✅ **Account-scoped access** - OAuth tokens inherit account permissions
3. ✅ **Auto-approve for first-party clients** - Skip consent screen for Terminal49-owned clients
4. ✅ **Support both Token and Bearer schemes** - Backward compatible

### Open Questions:

1. **Should MCP OAuth tokens be separate from regular API keys?**
   - Current plan: Same table, identified by `oauth_client_id` field
   - Alternative: Separate `oauth_tokens` table

2. **Where should OAuth consent screen live?**
   - Current plan: Auto-approve (no UI needed initially)
   - Future: Standalone consent page at Terminal49 web app

3. **Token expiration strategy?**
   - Current: Long-lived tokens (no expiration)
   - Future: 90-day expiration + refresh token flow?

4. **Granular scopes?**
   - Current: Single 'read' scope (all MCP access)
   - Future: 'read', 'write', 'admin' scopes?

---

**Document Version**: 1.0
**Last Updated**: 2025-01-XX
**Author**: Claude Code
