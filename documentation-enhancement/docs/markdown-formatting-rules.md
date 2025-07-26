# Markdown Formatting Rules for OpenAPI Descriptions

## Problem
When markdown in OpenAPI descriptions is rendered by tools like Mintlify, Redoc, or Swagger UI, headers can appear too large and disrupt the visual hierarchy.

## Current Approach (Too Large)
```markdown
## Request Types
## Validation Rules  
## Processing Flow
```
This creates H2 headers which can be as large as the endpoint title itself.

## Better Approaches

### Option 1: Use H3 Headers (###)
```markdown
### Request Types
### Validation Rules
### Processing Flow
```
Smaller headers that still provide structure.

### Option 2: Use Bold Text Instead of Headers
```markdown
**Request Types**

You can track shipments using three different identifiers:
- `bill_of_lading` - Track using the bill of lading number
- `booking_number` - Track using the carrier's booking reference  
- `container` - Track a specific container

**Validation Rules**

- Container numbers must follow ISO 6346 format
- All tracking numbers require minimum 6 characters
```

### Option 3: Use Definition Lists (Recommended)
```markdown
**Request Types**
- **`bill_of_lading`** - Track using the bill of lading number
- **`booking_number`** - Track using the carrier's booking reference  
- **`container`** - Track a specific container (ISO 6346 format)

**Validation Rules**
- **Container numbers**: Must follow ISO 6346 format (e.g., MSCU1234567)
- **All tracking numbers**: Minimum 6 characters
- **SCAC codes**: Must be a supported shipping line
```

### Option 4: Minimal Headers with Horizontal Rules
```markdown
To track an ocean shipment, you create a new tracking request...

---

**Request Types**

You can track shipments using three different identifiers...

---

**Validation Rules**

The following validation rules apply...
```

## Recommended Format for OpenAPI Descriptions

```markdown
[Main description paragraph explaining the purpose and workflow]

**[Section Name]**
[Section content with bullet points or paragraphs]

**[Section Name]**  
- **Term**: Definition
- **Term**: Definition

**Examples**
```json
{
  "example": "here"
}
```
```

## Example: Properly Formatted Tracking Request Description

```markdown
To track an ocean shipment, you create a new tracking request. Two attributes are required to track a shipment: a bill of lading/booking number and a shipping line SCAC.

Once a tracking request is created we will attempt to fetch the shipment details and its related containers from the shipping line. If successful, we will create a new shipment object including any related container objects and send a `tracking_request.succeeded` webhook notification.

If the attempt fails, we will send a `tracking_request.failed` webhook notification.

**Request Types**

You can track shipments using three different identifiers:
- **`bill_of_lading`** - Track using the bill of lading number
- **`booking_number`** - Track using the carrier's booking reference  
- **`container`** - Track a specific container (must be valid ISO 6346 format)

**Validation Rules**
- **Container numbers**: Must follow ISO 6346 format (4 letters + 7 digits)
- **Tracking numbers**: Minimum 6 characters required
- **SCAC codes**: Must be a supported shipping line (see `/shipping_lines`)

**Processing Flow**
1. **Pending** - Request queued for processing
2. **In Progress** - Fetching data from shipping line
3. **Succeeded** - Shipment and containers created
4. **Failed** - Unable to track (see `failed_reason`)

**Important Notes**
- Duplicate requests return the existing tracking request
- Temporary failures are retried automatically
- Webhook notifications require at least one active webhook
```

## Rules for OpenAPI Description Formatting

1. **Avoid H1 (#) and H2 (##)** - Too large in most renderers
2. **Use bold text for section titles** - Clear without being oversized
3. **Use bullet points liberally** - Easy to scan
4. **Keep paragraphs short** - 2-3 sentences max
5. **Use inline code for values** - `like_this` for parameters/values
6. **Group related information** - Don't scatter details
7. **Lead with the purpose** - What and why before how

## Testing Your Formatting

Always test in the actual tool:
1. Apply the changes to OpenAPI
2. View in Mintlify/Swagger/Redoc
3. Adjust based on actual rendering
4. Consider mobile view as well