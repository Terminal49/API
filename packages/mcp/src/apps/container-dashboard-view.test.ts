/**
 * Drives the dashboard view in jsdom as an MCP Apps host would: answer
 * ui/initialize, deliver the tool result, then answer the view's own
 * tools/call, ui/message and ui/update-model-context requests.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { CONTAINER_DASHBOARD_HTML } from './container-dashboard-view.js';

// The package compiles without DOM types; jsdom provides these at run time.
// SAFETY: the jsdom environment above defines these globals.
const { window, document, DOMParser, MessageEvent } = globalThis as any;

type Message = {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: any;
  result?: any;
};

const DASHBOARD = {
  summary: 'Showing the dashboard.',
  title: 'Containers at risk',
  generated_at: '2026-11-27T15:00:00Z',
  app_url: 'https://app.example.test',
  filters: {},
  totals: { containers: 12, needs_attention: 3, with_holds: 2 },
  breakdowns: {
    status: [
      { key: 'On Ship', label: 'On Ship', count: 7 },
      { key: 'Available', label: 'Available', count: 5 },
    ],
    terminal: [{ key: 't-1', label: 'Fenix Marine', count: 5 }],
    carrier: [{ key: 'sl-1', label: 'MAEU', count: 12 }],
    hold_type: [{ key: 'CUSTOMS', label: 'CUSTOMS', count: 2 }],
    lfd_by_day: [],
    arrivals_by_day: [],
  },
  containers: [
    {
      id: 'c-1',
      number: 'MSCU1234567',
      status: 'Available',
      pod_terminal: 'Fenix Marine',
      shipment: { bill_of_lading: 'MAEU999', shipping_line_scac: 'MAEU' },
      holds: ['CUSTOMS'],
    },
  ],
  page: { page: 1, page_size: 25, has_more: false },
};

/** Loads the view into a fresh document with a fake parent window. */
function mountView() {
  const sent: Message[] = [];
  const parent = {
    postMessage: (message: Message) =>
      sent.push(JSON.parse(JSON.stringify(message))),
  };
  Object.defineProperty(window, 'parent', {
    value: parent,
    configurable: true,
  });
  const doc = new DOMParser().parseFromString(
    CONTAINER_DASHBOARD_HTML,
    'text/html',
  );
  document.head.innerHTML = doc.head.innerHTML;
  document.body.innerHTML = doc.body.innerHTML;
  const script = doc.querySelector('script')!.textContent!;
  new Function(script)();
  const fromHost = (message: Omit<Message, 'jsonrpc'>) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { jsonrpc: '2.0', ...message },
        source: parent as any,
      }),
    );
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const last = (method: string) =>
    [...sent].reverse().find((m) => m.method === method);
  return { sent, fromHost, flush, last };
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('container dashboard view', () => {
  it('has no characters that would end its template literal', () => {
    expect(CONTAINER_DASHBOARD_HTML).not.toMatch(/`|\$\{/);
    expect(CONTAINER_DASHBOARD_HTML).not.toMatch(
      /<(script|link|img)[^>]+(src|href)=["']https?:/,
    );
  });

  it('completes the MCP Apps handshake, renders the result, and drills down through the host', async () => {
    const view = mountView();

    const init = view.last('ui/initialize')!;
    expect(init.params).toMatchObject({
      protocolVersion: '2026-01-26',
      appInfo: { name: 'terminal49-container-dashboard' },
    });
    view.fromHost({
      id: init.id,
      result: {
        protocolVersion: '2026-01-26',
        hostInfo: { name: 'test-host', version: '1' },
        hostCapabilities: {},
        hostContext: {
          theme: 'dark',
          displayMode: 'inline',
          availableDisplayModes: ['inline', 'fullscreen'],
        },
      },
    });
    await view.flush();
    expect(view.last('ui/notifications/initialized')).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.getElementById('fullscreen').hidden).toBe(false);

    view.fromHost({
      method: 'ui/notifications/tool-result',
      params: {
        content: [{ type: 'text', text: 'x' }],
        structuredContent: DASHBOARD,
      },
    });
    expect(document.getElementById('title')!.textContent).toBe(
      'Containers at risk',
    );
    const tiles = [...document.querySelectorAll('.tile .n')].map(
      (n) => n.textContent,
    );
    expect(tiles).toEqual(['12', '7', '5', '5', '3', '2']);
    expect(document.querySelector('#rows tr')!.textContent).toContain(
      'MSCU1234567',
    );

    // A tile re-runs the dashboard tool with its filter.
    document.querySelectorAll('.tile')[4].click();
    const call = view.last('tools/call')!;
    expect(call.params).toEqual({
      name: 'show_container_dashboard',
      arguments: { requires_attention: true, sort: 'attention_priority' },
    });
    view.fromHost({
      id: call.id,
      result: {
        content: [],
        structuredContent: { ...DASHBOARD, title: 'Filtered' },
      },
    });
    await view.flush();
    expect(document.getElementById('title')!.textContent).toBe('Filtered');
    expect(document.getElementById('chips')!.textContent).toContain(
      'Needs attention',
    );
    expect(
      view.last('ui/update-model-context')!.params.content[0].text,
    ).toContain('Showing the dashboard.');

    // A row opens the drawer through get_container.
    document.querySelector('#rows tr').click();
    const detail = view.last('tools/call')!;
    expect(detail.params).toEqual({
      name: 'get_container',
      arguments: { id: 'c-1' },
    });
    view.fromHost({
      id: detail.id,
      result: {
        content: [],
        structuredContent: {
          id: 'c-1',
          container_number: 'MSCU1234567',
          status: 'Available',
          equipment: {},
          location: { availability_known: true, available_for_pickup: true },
          demurrage: {
            pickup_lfd: '2026-11-30',
            urgency: 'imminent',
            holds_at_pod_terminal: [],
          },
          shipment: { id: 's-1', ref_numbers: [] },
          pod_terminal: { id: 't-1', name: 'Fenix Marine' },
          events: {
            count: 1,
            timeline: [
              {
                event: 'container.transport.vessel_discharged',
                timestamp: '2026-11-26T10:00:00Z',
              },
            ],
          },
        },
      },
    });
    await view.flush();
    expect(document.body.classList.contains('drawer-open')).toBe(true);
    expect(document.getElementById('d-body')!.textContent).toContain(
      'Transport vessel discharged',
    );
    expect(
      view.last('ui/update-model-context')!.params.content[0].text,
    ).toContain('opened container MSCU1234567');

    // Ask and Open go through the host.
    document.getElementById('d-ask').click();
    expect(view.last('ui/message')!.params).toMatchObject({ role: 'user' });
    document.getElementById('d-open').click();
    expect(view.last('ui/open-link')!.params).toEqual({
      url: 'https://app.example.test/shipments/s-1',
    });
  });

  it('answers host requests such as teardown', () => {
    const view = mountView();
    view.fromHost({ id: 99, method: 'ui/resource-teardown', params: {} });
    expect(view.sent.find((m) => m.id === 99)).toEqual({
      jsonrpc: '2.0',
      id: 99,
      result: {},
    });
  });
});
