import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { warnUnsupportedFilters } from '../src/commands/action.js';
import { printError } from '../src/errors.js';
import { createFormatter } from '../src/output/formatter.js';
import { encodeTerminalText } from '../src/output/terminal-text.js';
import { runProgram } from './helpers.js';

const marker = 'safe\x1b[2J\x07\r\n\u202evalue';
const originalIsTTY = process.stderr.isTTY;
afterEach(() => {
  vi.restoreAllMocks();
  process.stderr.isTTY = originalIsTTY;
});

describe('human terminal boundaries', () => {
  it('encodes every C0, DEL, C1, and bidi formatting control', () => {
    const controls = [
      ...Array.from({ length: 32 }, (_, index) => index),
      ...Array.from({ length: 33 }, (_, index) => index + 127),
      0x61c,
      0x200e,
      0x200f,
      0x202a,
      0x202b,
      0x202c,
      0x202d,
      0x202e,
      0x2066,
      0x2067,
      0x2068,
      0x2069,
    ];
    for (const code of controls)
      expect(encodeTerminalText(String.fromCharCode(code))).toBe(
        `\\u${code.toString(16).padStart(4, '0')}`,
      );
    expect(encodeTerminalText('Vessel 日本語')).toBe('Vessel 日本語');
  });

  it('encodes human errors and unsupported-filter warnings', () => {
    process.stderr.isTTY = true;
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    printError(new Error(marker));
    warnUnsupportedFilters({ unsupportedFilters: [marker] });
    for (const [chunk] of write.mock.calls) {
      expect(String(chunk)).not.toMatch(/[\x1b\x07\r\u202e]/);
      expect(String(chunk)).toContain('\\u001b');
    }
  });

  it('preserves JSON values through serialization', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    createFormatter({ json: true }).output('test', { value: marker });
    expect(JSON.parse(String(write.mock.calls[0][0])).data.value).toBe(marker);
  });

  it('encodes malicious Commander arguments on the human error path', async () => {
    process.stderr.isTTY = true;
    const result = await runProgram([`--unknown${marker}`]);
    expect(result.status).toBe(2);
    expect(result.stderr).not.toMatch(/[\x1b\x07\r\u202e]/);
    expect(result.stderr).toContain('\\u001b');
  });
});
