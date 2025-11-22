# Integration Tests

Integration tests require a valid Terminal49 API key to run against the actual API.

## Setup

1. Copy `.env.example` to `.env` in the root directory
2. Add your Terminal49 API key to the `.env` file:
   ```
   TERMINAL49_API_KEY=Token your_api_key_here
   ```

## Running Integration Tests

Integration tests are skipped by default in CI/CD. To run them locally:

```bash
# Run all tests including integration tests
npm test

# Run only integration tests
npm test tests/integration
```

## Writing Integration Tests

Integration tests should:
- Use real API endpoints
- Handle rate limiting gracefully
- Clean up any created resources
- Be idempotent (safe to run multiple times)
- Not rely on specific data existing in the account

Example:

```typescript
import { describe, it, expect } from 'vitest';
import { listShipments } from '../../src';

describe('Shipments Integration', () => {
  it('should list shipments', async () => {
    const shipments = await listShipments({ pageSize: 5 });

    expect(Array.isArray(shipments)).toBe(true);
    // Don't assert on length as it depends on account data
  });
});
```
