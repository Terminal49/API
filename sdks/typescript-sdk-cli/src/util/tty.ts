export function isOutputTTY(stream: 'stdout' | 'stderr' = 'stdout'): boolean {
  if (stream === 'stderr') {
    return Boolean(process.stderr.isTTY);
  }
  return Boolean(process.stdout.isTTY);
}

export function isColorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (process.env.TERM === 'dumb') return false;
  if (process.env.CLICOLOR_FORCE === '0') return false;
  return process.stdout.isTTY === true;
}

export function supportsAnsi(stream: 'stdout' | 'stderr' = 'stdout'): boolean {
  if (!isColorEnabled()) return false;
  return isOutputTTY(stream);
}
