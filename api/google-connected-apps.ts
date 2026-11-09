import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end();
    return;
  }

  const verification = parseVerification(
    process.env.GOOGLE_CONNECTED_APPS_VERIFICATION,
  );

  if (!verification) {
    res.statusCode = 404;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(verification);
}

function parseVerification(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    if (!('verification_tokens' in parsed)) return undefined;
    const tokens = parsed.verification_tokens;
    if (!Array.isArray(tokens) || tokens.length === 0) return undefined;
    return JSON.stringify(parsed);
  } catch {
    return undefined;
  }
}
