# Terminal49 API Documentation Repository

This is the official API documentation for Terminal49's shipment tracking platform, built with Mintlify.

## Key Resources
- **API Specification**: `/docs/openapi.json` - Complete OpenAPI 3.0 spec
- **Mintlify Config**: `/docs/mint.json` - Documentation structure and navigation
- **Base API URL**: `https://api.terminal49.com/v2`
- **Authentication**: Token-based (`Authorization: Token YOUR_API_KEY`)
- **Response Format**: JSONAPI schema

## Important Files to Reference

### When working on API documentation:
- ALWAYS check `/docs/openapi.json` for endpoint specifications
- ALWAYS check `/docs/mint.json` for navigation structure
- ALWAYS check existing MDX files in `/docs/api-docs/api-reference/` for patterns

### Documentation Structure:
```
docs/
├── api-docs/
│   ├── getting-started/     # New user guides
│   ├── in-depth-guides/     # Feature tutorials
│   ├── api-reference/       # Endpoint documentation
│   └── useful-info/         # Testing, pricing, etc.
├── datasync/               # DataSync product docs
├── images/                 # Documentation images
├── logos/                  # Brand assets
├── mint.json              # Mintlify configuration
└── openapi.json           # API specification
```

## API Endpoints Quick Reference

### Core Resources:
- **Shipments**: GET/POST `/shipments`, GET/PATCH `/shipments/{id}`, POST `/shipments/{id}/stop_tracking`, POST `/shipments/{id}/resume_tracking`
- **Containers**: GET `/containers`, GET `/containers/{id}`, GET `/containers/{id}/raw_events`, GET `/containers/{id}/transport_events`
- **Tracking Requests**: GET/POST `/tracking-requests`, GET/PATCH `/tracking-requests/{id}`
- **Webhooks**: GET/POST `/webhooks`, GET/PATCH/DELETE `/webhooks/{id}`, GET `/webhooks/ips`
- **Webhook Notifications**: GET `/webhook-notifications`, GET `/webhook-notifications/{id}`
- **Parties** (Customers): GET/POST `/parties`, GET/PATCH `/parties/{id}`
- **Ports**: GET `/ports/{locode}` or `/ports/{id}`
- **Terminals**: GET `/terminals/{id}`
- **Vessels**: GET `/vessels/{id}`, GET `/vessels/imo/{imo}`
- **Shipping Lines**: GET `/shipping-lines`, GET `/shipping-lines/{scac}`
- **Metro Areas**: GET `/metro-areas/{locode}` or `/metro-areas/{id}`

## Mintlify Documentation Patterns

### MDX File Structure:
```mdx
---
title: Endpoint Title
description: Brief description (optional)
openapi: get /shipments  # Links to OpenAPI spec
---

Content goes here...
```

### Common Components:
- `<Card>` - For callout boxes and links
- `<CodeGroup>` - For multi-language code examples
- `<Param>` - For parameter documentation
- `<ResponseExample>` - For API response examples

### Adding New API Endpoints:
1. Update `/docs/openapi.json` with complete endpoint specification
2. Create MDX file in appropriate `/docs/api-docs/api-reference/[resource]/` folder
3. Add to navigation in `/docs/mint.json` under the correct group
4. Include `openapi: METHOD /path` in MDX frontmatter
5. Update `Terminal49-API.postman_collection.json` if needed

### Image Assets:
- Store in `/docs/images/` or `/assets/images/`
- Use descriptive names (e.g., `webhook-flow-diagram.png`)
- Reference in MDX as `/images/filename.png`

## Task Checklists

### When adding a new API endpoint:
- [ ] Define endpoint in `openapi.json` with all parameters, responses, and examples
- [ ] Create MDX documentation file with proper frontmatter
- [ ] Add to `mint.json` navigation in the appropriate section
- [ ] Update Postman collection with example request
- [ ] Include example responses for success and error cases
- [ ] Document all possible error codes and their meanings
- [ ] Add any necessary diagrams or screenshots

### When updating existing endpoints:
- [ ] Update `openapi.json` specification
- [ ] Update corresponding MDX file content
- [ ] Check for broken references in other docs
- [ ] Update examples if request/response format changed
- [ ] Verify navigation still makes sense
- [ ] Update Postman collection if needed

### When documenting new features:
- [ ] Create guide in `/docs/api-docs/in-depth-guides/`
- [ ] Add relevant API endpoint references
- [ ] Include practical examples and use cases
- [ ] Add to navigation in `mint.json`
- [ ] Cross-reference from related endpoint docs

## Testing & Validation

### Testing Resources:
- Test tracking numbers: `/docs/api-docs/useful-info/test-numbers.mdx`
- Postman collection: `Terminal49-API.postman_collection.json`
- Webhook testing IPs: Available via `/webhooks/ips` endpoint
- Example webhook payloads: `/docs/api-docs/useful-info/webhook-events-examples.mdx`

### Local Development:
```bash
# Preview documentation locally
mintlify dev

# Validate OpenAPI spec
# Use tools like Redocly CLI or Spectral
```

## DataSync Documentation

DataSync is a separate product for data synchronization. Documentation lives in `/docs/datasync/`:
- Overview and setup guides
- Supported destinations
- Table properties for each data type

## Deployment

- **Docker**: Uses Redocly/Redoc for API documentation rendering
- **Configuration**: See `Dockerfile`, `render.yaml`, and `nginx.conf`
- **Auto-generated**: Postman collection is auto-generated from `openapi.json`

## Support & Resources

- **Contact**: support@terminal49.com
- **Website**: https://www.terminal49.com
- **App**: https://app.terminal49.com/
- **API Keys**: https://app.terminal49.com/developers/api-keys