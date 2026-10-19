import { describe, expect, it } from 'vite-plus/test';
import { readQueryGuidanceResource } from './query-guidance.js';

describe('query guidance', () => {
  const guidance = readQueryGuidanceResource();

  it('uses the dashboard definitions', () => {
    expect(guidance).toContain(
      'current_status "available,not_available,grounded,awaiting_inland_transfer"',
    );
    expect(guidance).toContain('requires_attention: true');
    expect(guidance).not.toContain('picked_up_at: "@not_exists"');
  });

  it('limits next-N-days LFD windows to containers still at the terminal', () => {
    expect(guidance).toContain(
      'current_status "available,not_available,grounded", with pickup_lfd: [">=today", "<=N.days.from_now"]',
    );
    expect(guidance).toContain('includes today and day N');
  });
});
