# Endpoint Documentation Template

## Overview
This template provides a standardized format for documenting Terminal49 API endpoints with comprehensive examples, clear explanations, and business context.

---

```yaml
---
title: [Endpoint Name - e.g., "Create a Tracking Request"]
description: [Brief description of what this endpoint does]
openapi: [method] [path] # e.g., post /tracking_requests
---
```

## Endpoint Purpose
[1-2 sentences explaining what this endpoint is used for and when you would use it in your integration]

## Business Use Cases
[Brief explanation of common business scenarios where this endpoint is valuable]
- **Use Case 1**: [e.g., "Initiate tracking for a new container shipment"]
- **Use Case 2**: [e.g., "Set up automated monitoring for a customer's bill of lading"]

## Request Format

### Required Parameters
[List and explain required parameters]

### Optional Parameters
[List and explain optional parameters]

### Example Requests

#### Example 1: [Basic/Common Scenario]
```json
// Request
{
  [Request body with comments explaining key fields]
}

// Response
{
  [Success response with comments explaining important fields]
}
```

#### Example 2: [Alternative Scenario]
```json
// Request
{
  [Request body for alternative scenario]
}

// Response
{
  [Response showing different outcome]
}
```

#### Example 3: [Error Scenario]
```json
// Request
{
  [Request body that would cause an error]
}

// Response
{
  [Error response with explanation]
}
```

## Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `field1` | string | [Explanation with business context] |
| `field2` | integer | [Explanation with business context] |

## Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success - [what this means] |
| 400 | Bad Request - [common causes] |
| 401 | Unauthorized - [authentication issue] |
| 422 | Unprocessable Entity - [validation errors] |

## Related Webhooks
If you've registered for webhooks, you may receive the following events related to this endpoint:
- `event.name`: [Description of when this event is triggered]
- `event.name2`: [Description of when this event is triggered]

## Related Guides
- [Link to related guide]
- [Link to tutorial that uses this endpoint]

## Troubleshooting
Common issues and their solutions:
- **Issue**: [Common error or confusion]
  **Solution**: [How to resolve it]

- **Issue**: [Another common issue]
  **Solution**: [How to resolve it]
