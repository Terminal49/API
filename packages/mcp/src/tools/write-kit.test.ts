import { describe, expect, it } from 'vite-plus/test';
import {
  canonicalJson,
  checkConfirmationToken,
  CONFIRMATION_TTL_MS,
  type ConfirmationBinding,
  credentialHash,
  issueConfirmationToken,
  stateFingerprint,
  usableConfirmationSecret,
} from './write-kit.js';

const SECRET = 'a-test-secret-that-is-long-enough-to-sign';
const NOW = Date.parse('2026-10-17T12:00:00Z');
const ACCOUNT_ID = 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a';
const OTHER_ACCOUNT_ID = 'c8f3d0b2-6e4a-4f9c-8d1b-2a3f4e5d6c7b';
const SHIPMENT_ID = '1f0e8a52-3c4d-4b6e-9f7a-8b9c0d1e2f3a';

const binding: ConfirmationBinding = {
  tool: 'stop_shipment_tracking',
  args: { shipment_id: SHIPMENT_ID },
  accountId: ACCOUNT_ID,
  credentialHash: credentialHash('Token key-1'),
  channel: 'token',
};
const fingerprint = stateFingerprint({ tracking_stopped: false });

function issue(at = NOW) {
  return issueConfirmationToken(SECRET, binding, fingerprint, at)
    .confirmation_token;
}

function check(
  token: string,
  overrides: Partial<ConfirmationBinding> = {},
  options: { at?: number; fingerprint?: string; secret?: string } = {},
) {
  return checkConfirmationToken(
    options.secret ?? SECRET,
    token,
    { ...binding, ...overrides },
    options.fingerprint ?? fingerprint,
    options.at ?? NOW + 1000,
  );
}

describe('confirmation token', () => {
  it('accepts a token for the same call, account, credential and state', () => {
    expect(check(issue())).toEqual({ ok: true });
  });

  it('expires five minutes after it was issued', () => {
    const issued = issueConfirmationToken(SECRET, binding, fingerprint, NOW);

    expect(issued.expires_at).toBe('2026-10-17T12:05:00.000Z');
    expect(check(issue(), {}, { at: NOW + CONFIRMATION_TTL_MS - 1 })).toEqual({
      ok: true,
    });
    expect(check(issue(), {}, { at: NOW + CONFIRMATION_TTL_MS })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects a token whose expiry was moved forward', () => {
    const [prefix, , state, signature] = issue().split('.');
    const later = (NOW + 60 * CONFIRMATION_TTL_MS).toString(36);

    expect(
      check(
        [prefix, later, state, signature].join('.'),
        {},
        {
          at: NOW + 2 * CONFIRMATION_TTL_MS,
        },
      ),
    ).toEqual({ ok: false, reason: 'mismatch' });
  });

  it.each([
    ['the state tag', 2],
    ['the signature', 3],
  ])('reports a flipped character in %s as a mismatch', (_label, part) => {
    const parts = issue().split('.');
    const mac = parts[part]!;
    parts[part] = (mac[0] === 'A' ? 'B' : 'A') + mac.slice(1);

    expect(check(parts.join('.'))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it.each(['', 'not-a-token', 't49ct1.x.y.z', `${issue()}extra`])(
    'rejects a malformed token %j',
    (token) => {
      expect(check(token)).toEqual({ ok: false, reason: 'malformed' });
    },
  );

  it('rejects a token issued for another account', () => {
    expect(check(issue(), { accountId: OTHER_ACCOUNT_ID })).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('rejects a token issued for another credential', () => {
    expect(
      check(issue(), { credentialHash: credentialHash('Token key-2') }),
    ).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a token issued for other arguments or another tool', () => {
    expect(
      check(issue(), {
        args: { shipment_id: '2a1f9b63-4d5e-4c7f-8a0b-9c1d2e3f4a5b' },
      }),
    ).toEqual({ ok: false, reason: 'mismatch' });
    expect(check(issue(), { tool: 'resume_shipment_tracking' })).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('rejects a token signed with another secret', () => {
    expect(
      check(issue(), {}, { secret: 'another-secret-that-is-also-long-enough' }),
    ).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('reports stale state separately from a bad token', () => {
    expect(
      check(
        issue(),
        {},
        {
          fingerprint: stateFingerprint({ tracking_stopped: true }),
        },
      ),
    ).toEqual({ ok: false, reason: 'stale' });
  });

  it('binds the arguments regardless of key order', () => {
    const token = issueConfirmationToken(
      SECRET,
      { ...binding, args: { a: 1, b: { c: 2, d: 3 } } },
      fingerprint,
      NOW,
    ).confirmation_token;

    expect(check(token, { args: { b: { d: 3, c: 2 }, a: 1 } }).ok).toBe(true);
  });
});

describe('usableConfirmationSecret', () => {
  it.each([undefined, '', '   ', 'short-secret'])(
    'treats %j as missing',
    (value) => {
      expect(usableConfirmationSecret(value)).toBeUndefined();
    },
  );

  it('keeps a secret of at least 32 characters, trimmed', () => {
    expect(usableConfirmationSecret(`  ${SECRET} `)).toBe(SECRET);
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level and drops undefined values', () => {
    expect(canonicalJson({ b: [{ z: 1, y: undefined, x: 2 }], a: null })).toBe(
      '{"a":null,"b":[{"x":2,"z":1}]}',
    );
  });
});
