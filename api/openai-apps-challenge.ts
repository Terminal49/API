import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end();
    return;
  }

  const challenge = process.env.OPENAI_APPS_CHALLENGE?.trim();

  if (!challenge) {
    res.statusCode = 404;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.end(challenge);
}
