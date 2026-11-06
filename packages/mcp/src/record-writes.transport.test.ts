/**
 * Runs set_party_role and set_custom_field through the HTTP handler and the
 * MCP client on both confirmation channels: an additive call writes at once,
 * and a call in which a record would lose a party or a value asks the user
 * once for the whole batch.
 */
import type { Client } from '@modelcontextprotocol/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';
import { fakeApiFetch, type FakeRoutes } from './test/fake-api.js';
import {
  answerWith,
  asksTheUser,
  connect,
  modern,
  type Session,
} from './test/gateway-session.js';
import { meBody, tokenOf } from './test/write-context.js';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const NEW_PARTY = '99999999-9999-4999-8999-999999999999';
const OLD_PARTY = '88888888-8888-4888-8888-888888888888';

interface Assignment {
  id: string;
  party_id: string;
}

const PARTY_NAMES: Record<string, string> = {
  [NEW_PARTY]: 'Manzo Transport',
  [OLD_PARTY]: 'Old Dray Co',
};

/**
 * Three containers: C1 has the old dray carrier, C2 has none, C3 already has
 * the new one. Every party role request is counted.
 */
function containers() {
  const carriers = new Map<string, Assignment[]>([
    [C1, [{ id: 'pr-c1', party_id: OLD_PARTY }]],
    [C2, []],
    [C3, [{ id: 'pr-c3', party_id: NEW_PARTY }]],
  ]);
  let nextId = 100;
  const routes: FakeRoutes = {
    'GET /me': { body: meBody() },
    [`GET /parties/${NEW_PARTY}`]: {
      body: {
        data: {
          id: NEW_PARTY,
          type: 'party',
          attributes: { company_name: 'Manzo Transport' },
        },
      },
    },
  };
  for (const id of carriers.keys()) {
    routes[`GET /containers/${id}/party_roles`] = () => ({
      body: {
        data: (carriers.get(id) ?? []).map((assignment) => ({
          id: assignment.id,
          type: 'party_role',
          attributes: { role: 'pickup_dray_carrier' },
          relationships: {
            party: { data: { type: 'party', id: assignment.party_id } },
          },
        })),
        included: (carriers.get(id) ?? []).map((assignment) => ({
          id: assignment.party_id,
          type: 'party',
          attributes: { company_name: PARTY_NAMES[assignment.party_id] },
        })),
      },
    });
    routes[`POST /containers/${id}/party_roles`] = (request) => {
      const body = request.body as {
        data: { relationships: { party: { data: { id: string } } } };
      };
      const assignment = {
        id: `pr-${nextId++}`,
        party_id: body.data.relationships.party.data.id,
      };
      carriers.set(id, [...(carriers.get(id) ?? []), assignment]);
      return { status: 201, body: { data: { id: assignment.id } } };
    };
    for (const assignment of ['pr-c1', 'pr-c3']) {
      routes[`DELETE /containers/${id}/party_roles/${assignment}`] = () => {
        carriers.set(
          id,
          (carriers.get(id) ?? []).filter((a) => a.id !== assignment),
        );
        return { status: 204 };
      };
    }
  }
  const api = fakeApiFetch(routes);
  return {
    api,
    carriers,
    writes: () =>
      api.requests
        .filter((request) => request.method !== 'GET')
        .map((request) => `${request.method} ${request.path}`),
    setCarrier: (id: string, partyId: string) => {
      carriers.set(id, [
        { id: `pr-${id.slice(0, 2)}-late`, party_id: partyId },
      ]);
    },
  };
}

/** Two containers whose custom field `po_number` the test can preset. */
function fields(initial: Record<string, string | null>) {
  const values = new Map(Object.entries(initial));
  const routes: FakeRoutes = { 'GET /me': { body: meBody() } };
  for (const id of values.keys()) {
    routes[`GET /containers/${id}/custom_fields`] = () => {
      const value = values.get(id);
      return {
        body: {
          data:
            value == null
              ? []
              : [
                  {
                    id: `cf-${id}`,
                    type: 'custom_field',
                    attributes: { api_slug: 'po_number', value },
                  },
                ],
        },
      };
    };
    routes[`POST /containers/${id}/custom_fields`] = (request) => {
      const body = request.body as { data: { attributes: { value: string } } };
      values.set(id, body.data.attributes.value);
      return { status: 201, body: { data: { id: `cf-${id}` } } };
    };
    routes[`DELETE /containers/${id}/custom_fields/po_number`] = () => {
      values.set(id, null);
      return { status: 204 };
    };
  }
  const api = fakeApiFetch(routes);
  return {
    api,
    values,
    writes: () =>
      api.requests
        .filter((request) => request.method !== 'GET')
        .map((request) => `${request.method} ${request.path}`),
  };
}

async function setParty(
  client: Client,
  args: Record<string, unknown>,
  containerIds = [C1, C2, C3],
) {
  return client.callTool({
    name: 'set_party_role',
    arguments: {
      container_ids: containerIds,
      role: 'pickup_dray_carrier',
      party_id: NEW_PARTY,
      ...args,
    },
  });
}

async function setField(client: Client, args: Record<string, unknown>) {
  return client.callTool({
    name: 'set_custom_field',
    arguments: {
      entity: 'container',
      ids: [C1, C2],
      api_slug: 'po_number',
      ...args,
    },
  });
}

describe('batch record writes', () => {
  let session: Session | undefined;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await session?.close();
    session = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches a party at once without asking the user', async () => {
    const fixture = containers();
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(asksTheUser);
    const asked = answerWith(session.client, {
      action: 'accept',
      content: { confirm: true },
    });

    const result = await setParty(session.client, { action: 'add' }, [C2, C3]);

    expect(asked).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      updated: [C2],
      unchanged: [C3],
      failed: [],
      not_attempted: [],
      summary:
        'Assigned pickup_dray_carrier on 1 container; 1 already had it; 0 failed.',
    });
    expect(fixture.writes()).toEqual([`POST /containers/${C2}/party_roles`]);
    expect(session.calls).toHaveLength(1);
  });

  it('asks once for the whole batch, listing each record that changes, and writes on accept', async () => {
    const fixture = containers();
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(asksTheUser);
    const asked = answerWith(session.client, {
      action: 'accept',
      content: { confirm: true },
    });

    const result = await setParty(session.client, { action: 'replace' });

    expect(asked).toHaveBeenCalledOnce();
    expect(asked.mock.calls[0]?.[0]?.params.message).toBe(
      [
        'set_party_role on 3 containers',
        'Makes Manzo Transport the only pickup_dray_carrier on 2 containers; 1 of them lose the party now in that role. 1 unchanged.',
        `${C1}: Old Dray Co -> Manzo Transport`,
        `${C2}: (none) -> Manzo Transport`,
      ].join('\n'),
    );
    expect(result.structuredContent).toEqual({
      updated: [C1, C2],
      unchanged: [C3],
      failed: [],
      not_attempted: [],
      summary:
        'Set pickup_dray_carrier on 2 containers; 1 already had only that party; 0 failed.',
    });
    expect(fixture.writes()).toEqual([
      `POST /containers/${C1}/party_roles`,
      `POST /containers/${C2}/party_roles`,
      `DELETE /containers/${C1}/party_roles/pr-c1`,
    ]);
    expect(fixture.carriers.get(C1)?.map((a) => a.party_id)).toEqual([
      NEW_PARTY,
    ]);
    expect(session.results[0]).toMatchObject({
      resultType: 'input_required',
      requestState: expect.stringMatching(/^t49ct1\./),
    });
  });

  it('writes nothing when the user declines the batch', async () => {
    const fixture = containers();
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(asksTheUser);
    answerWith(session.client, { action: 'decline' });

    const result = await setParty(session.client, { action: 'remove' }, [C3]);

    expect(result.structuredContent).toEqual({
      status: 'declined',
      message: 'The user declined this change. Nothing was changed.',
    });
    expect(fixture.writes()).toEqual([]);
  });

  it('asks again with the current state when a record changed before the user answered', async () => {
    const fixture = containers();
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(asksTheUser);
    const messages: string[] = [];
    session.client.setRequestHandler('elicitation/create', async (request) => {
      messages.push(request.params.message);
      // C2 gains a carrier between the preview and the user's yes.
      if (messages.length === 1) fixture.setCarrier(C2, OLD_PARTY);
      return { action: 'accept', content: { confirm: true } };
    });

    const result = await setParty(session.client, { action: 'replace' });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain(
      'The record changed after you last saw it. Here is its current state.',
    );
    expect(messages[1]).toContain(`${C2}: Old Dray Co -> Manzo Transport`);
    expect(result.structuredContent).toMatchObject({
      updated: [C1, C2],
      unchanged: [C3],
    });
    expect(
      fixture.writes().filter((write) => write.startsWith('POST')),
    ).toHaveLength(2);
  });

  it('keeps the preview-then-token flow for a client that cannot ask', async () => {
    const fixture = containers();
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(modern);

    const preview = await setParty(session.client, { action: 'remove' }, [
      C2,
      C3,
    ]);
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
      preview: {
        reach:
          'Detaches Manzo Transport from the pickup_dray_carrier role on 1 container. 1 unchanged.',
        changes: [
          {
            id: C3,
            current: [{ party_id: NEW_PARTY, party_name: 'Manzo Transport' }],
            proposed: [],
          },
        ],
        unchanged: 1,
      },
    });
    expect(fixture.writes()).toEqual([]);

    const token = tokenOf(preview.structuredContent);
    const removed = await setParty(
      session.client,
      { action: 'remove', confirmation_token: token },
      [C2, C3],
    );
    expect(removed.structuredContent).toEqual({
      updated: [C3],
      unchanged: [C2],
      failed: [],
      not_attempted: [],
      summary:
        'Removed pickup_dray_carrier on 1 container; 1 already without it; 0 failed.',
    });
    expect(fixture.writes()).toEqual([
      `DELETE /containers/${C3}/party_roles/pr-c3`,
    ]);

    // A repeat finds nothing left to detach, so it stops before any token
    // check and writes nothing more.
    const again = await setParty(
      session.client,
      { action: 'remove', confirmation_token: token },
      [C2, C3],
    );
    expect(again.structuredContent).toEqual({
      updated: [],
      unchanged: [C2, C3],
      failed: [],
      not_attempted: [],
      summary:
        'Removed pickup_dray_carrier on 0 containers; 2 already without it; 0 failed.',
    });
    expect(fixture.writes()).toHaveLength(1);
  });

  it('fails a remove of a party the record does not hold in that role, naming the party it has', async () => {
    const fixture = containers();
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(modern);

    const result = await setParty(session.client, { action: 'remove' }, [C1]);

    expect(result.structuredContent).toEqual({
      updated: [],
      unchanged: [],
      failed: [
        {
          id: C1,
          error: `No pickup_dray_carrier with party_id ${NEW_PARTY} on this record; it has Old Dray Co. Use the party_id shown in the record's party_roles (get_container include ['party_roles'] or get_shipment_details include_party_roles), not an id from list_parties, which can list a customer under its account id.`,
        },
      ],
      not_attempted: [],
      summary:
        'Removed pickup_dray_carrier on 0 containers; 0 already without it; 1 failed.',
    });
    expect(fixture.writes()).toEqual([]);
  });

  it('returns the token-channel stale_preview when a record changed between the rounds', async () => {
    const fixture = containers();
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(modern);

    const preview = await setParty(session.client, { action: 'replace' });
    fixture.setCarrier(C2, OLD_PARTY);
    const stale = await setParty(session.client, {
      action: 'replace',
      confirmation_token: tokenOf(preview.structuredContent),
    });

    expect(stale.structuredContent).toMatchObject({
      status: 'stale_preview',
      preview: { changes: [{ id: C1 }, { id: C2 }] },
    });
    expect(fixture.writes()).toEqual([]);
  });

  it('keeps the per-record result after a partial failure of an approved batch', async () => {
    const fixture = containers();
    fixture.api.requests.length = 0;
    const failing = fakeApiFetch({});
    vi.stubGlobal(
      'fetch',
      async (input: Request | URL | string, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        if (
          request.method === 'DELETE' &&
          new URL(request.url).pathname.endsWith('/party_roles/pr-c1')
        ) {
          await failing.fetch(request);
          return new Response(JSON.stringify({ errors: [{ status: '500' }] }), {
            status: 500,
            headers: { 'Content-Type': 'application/vnd.api+json' },
          });
        }
        return fixture.api.fetch(request);
      },
    );
    session = await connect(asksTheUser);
    answerWith(session.client, {
      action: 'accept',
      content: { confirm: true },
    });

    const result = await setParty(session.client, { action: 'replace' });

    expect(result.structuredContent).toEqual({
      updated: [C2],
      unchanged: [C3],
      failed: [
        {
          id: C1,
          error:
            'Attached the new party but could not detach another party in pickup_dray_carrier: Saving got no clear answer from Terminal49. The change may or may not have been applied; check this record before calling again.',
        },
      ],
      not_attempted: [],
      summary:
        'Set pickup_dray_carrier on 1 container; 1 already had only that party; 1 failed.',
    });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(result.structuredContent) },
    ]);
  });

  it('fills empty custom fields at once and asks before overwriting or clearing', async () => {
    const fixture = fields({ [C1]: null, [C2]: 'PO-OLD' });
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(asksTheUser);
    const asked = answerWith(session.client, {
      action: 'accept',
      content: { confirm: true },
    });

    const filled = await setField(session.client, { value: 'PO-NEW' });
    expect(filled.structuredContent).toMatchObject({
      updated: [C1, C2],
      unchanged: [],
    });
    expect(asked).toHaveBeenCalledOnce();
    expect(asked.mock.calls[0]?.[0]?.params.message).toBe(
      [
        'set_custom_field on 2 containers',
        'Sets po_number to "PO-NEW" on 2 containers; 1 of them lose a current value.',
        `${C1}: (empty) -> "PO-NEW"`,
        `${C2}: "PO-OLD" -> "PO-NEW"`,
      ].join('\n'),
    );

    const repeat = await setField(session.client, { value: 'PO-NEW' });
    expect(repeat.structuredContent).toMatchObject({
      updated: [],
      unchanged: [C1, C2],
    });
    expect(asked).toHaveBeenCalledOnce();

    const cleared = await setField(session.client, { value: null });
    expect(asked).toHaveBeenCalledTimes(2);
    expect(asked.mock.calls[1]?.[0]?.params.message).toContain(
      'Clears po_number on 2 containers.',
    );
    expect(cleared.structuredContent).toMatchObject({ updated: [C1, C2] });
    expect(fixture.values.get(C1)).toBeNull();
    expect(fixture.writes()).toEqual([
      `POST /containers/${C1}/custom_fields`,
      `POST /containers/${C2}/custom_fields`,
      `DELETE /containers/${C1}/custom_fields/po_number`,
      `DELETE /containers/${C2}/custom_fields/po_number`,
    ]);
  });

  it('fills only the empty field without asking when the other already matches', async () => {
    const fixture = fields({ [C1]: null, [C2]: 'PO-NEW' });
    vi.stubGlobal('fetch', fixture.api.fetch);
    session = await connect(asksTheUser);
    const asked = answerWith(session.client, { action: 'decline' });

    const result = await setField(session.client, { value: 'PO-NEW' });

    expect(asked).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      updated: [C1],
      unchanged: [C2],
    });
    expect(fixture.writes()).toEqual([`POST /containers/${C1}/custom_fields`]);
  });

  it('marks both batch tools as needing the user and tells the model when a call asks', async () => {
    vi.stubGlobal('fetch', containers().api.fetch);
    session = await connect(modern);

    const { tools } = await session.client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const name of ['set_party_role', 'set_custom_field']) {
      const tool = byName.get(name);
      expect(tool?._meta, name).toEqual({
        'anthropic/requiresUserInteraction': true,
      });
      expect(tool?.annotations, name).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      });
      expect(tool?.description, name).toMatch(
        /a call that only adds runs at once\. On a client that can ask the user \(form elicitation\)/,
      );
      expect(tool?.inputSchema.properties, name).toHaveProperty(
        'confirmation_token',
      );
    }
    expect(byName.get('stop_shipment_tracking')?.description).toMatch(
      /This change needs the user to approve a preview\. The first call changes nothing\./,
    );
  });

  it('is left out of a read-only server', async () => {
    const readOnly = createTerminal49McpServer('token', undefined, undefined, {
      readOnly: true,
    });
    // SAFETY: the test reads the SDK's private tool table by name only.
    const names = (server: unknown) =>
      Object.keys(
        (server as { _registeredTools: Record<string, unknown> })
          ._registeredTools,
      );
    expect(names(readOnly)).not.toContain('set_party_role');
    expect(names(readOnly)).not.toContain('set_custom_field');
    expect(names(readOnly)).toContain('search_container');
  });
});
