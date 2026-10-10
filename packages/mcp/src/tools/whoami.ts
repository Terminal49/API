/**
 * whoami tool
 * Reports which credential this session uses, which account it is scoped to, and which gated
 * features that pairing can use. Backed by GET /me, so every answer comes from the same gate
 * that enforces the feature.
 */

import type {
  CurrentAccount,
  CurrentCredential,
  Terminal49Client,
} from '@terminal49/sdk';

export interface WhoamiTrackingSlots {
  limit: number;
  used: number;
  remaining: number;
}

export interface WhoamiAccount {
  id: string;
  company_name: string;
  /** Business type: shipper (cargo owner), freight_forwarder, customs_broker, trucking_company, ... */
  company_type: string | null;
  /** Billing lifecycle: free_plan, in_trial, customer, locked, churned. */
  plan: string | null;
  scac: string | null;
  abbr_name: string | null;
  /** "City, ST, Country" assembled from whatever parts the account has. */
  location: string | null;
  /** Free and trial plans only; null when tracking is not slot-limited. */
  tracking_slots: WhoamiTrackingSlots | null;
}

export interface WhoamiUser {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  job_role: string | null;
  job_title: string | null;
  terminal49_staff: boolean;
}

export interface WhoamiFeature {
  status: string;
}

export interface WhoamiResponse {
  kind: 'api_key' | 'user';
  channel: string;
  credential_name: string | null;
  account: WhoamiAccount;
  user: WhoamiUser | null;
  /** Other open accounts the signed-in user can work in. Empty for API keys. */
  other_accounts: Array<{ id: string; company_name: string }>;
  features: Record<string, WhoamiFeature>;
}

function location(account: CurrentAccount): string | null {
  const parts = [account.city, account.stateAbbr, account.country].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function toAccount(account: CurrentAccount): WhoamiAccount {
  return {
    id: account.id,
    company_name: account.companyName,
    company_type: account.companyType ?? null,
    plan: account.plan ?? null,
    scac: account.scac ?? null,
    abbr_name: account.abbrName ?? null,
    location: location(account),
    tracking_slots: account.trackingSlots ?? null,
  };
}

export async function executeWhoami(
  client: Terminal49Client,
): Promise<WhoamiResponse> {
  // SAFETY: `format: 'mapped'` makes the SDK return the result of mapCurrentCredential.
  const me = (await client.me({ format: 'mapped' })) as CurrentCredential;

  const user = me.user
    ? {
        id: me.user.id,
        email: me.user.email,
        name: me.user.name ?? null,
        role: me.user.role ?? null,
        job_role: me.user.jobRole ?? null,
        job_title: me.user.jobTitle ?? null,
        terminal49_staff: me.user.admin === true,
      }
    : null;

  const otherAccounts = (me.user?.accounts ?? [])
    .filter((account) => account.id !== me.account.id)
    .map((account) => ({ id: account.id, company_name: account.companyName }));

  return {
    kind: me.kind,
    channel: me.channel,
    credential_name: me.name ?? null,
    account: toAccount(me.account),
    user,
    other_accounts: otherAccounts,
    features: me.features ?? {},
  };
}
