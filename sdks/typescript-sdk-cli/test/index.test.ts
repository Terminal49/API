import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/index.js';

function withFakeTty(fn: () => void): void {
  const original = process.stdout.isTTY;
  (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
  try {
    fn();
  } finally {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = original;
  }
}

describe('CLI program', () => {
  it('registers expected command groups', () => {
    const program = createProgram();
    const names = program.commands.map((command) => command.name()).sort();

    expect(names).toContain('containers');
    expect(names).toContain('shipments');
    expect(names).toContain('tracking-requests');
    expect(names).toContain('track');
    expect(names).toContain('shipping-lines');
    expect(names).toContain('search');
    expect(names).toContain('config');
    expect(names).toContain('commands');
  });

  it('supports --help command discovery', () => {
    withFakeTty(() => {
      const program = createProgram();
      const help = program.helpInformation();
      expect(help.includes('Usage: t49')).toBe(true);
    });
  });
});
