import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

test('loaded Segment SDK sends minimized initial and SPA page events', async (t) => {
  const dom = new JSDOM(
    '<!doctype html><title>API reference</title><link rel="canonical" href="https://docs.example.test/docs/api?key=CANONICAL_PRIVATE#CANONICAL_PRIVATE"><script></script>',
    {
      url: 'https://docs.example.test/docs/api?key=INITIAL_PRIVATE&utm_source=CAMPAIGN_PRIVATE#HASH_PRIVATE',
      referrer:
        'https://portal.example.test/private/account?key=REFERRER_PRIVATE#REFERRER_PRIVATE',
      runScripts: 'outside-only',
    },
  );
  const { window } = dom;
  const originals = new Map();
  function expose(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  t.after(() => {
    window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  for (const name of [
    'window',
    'document',
    'location',
    'history',
    'localStorage',
    'navigator',
  ]) {
    expose(name, window[name]);
  }

  const bodies = [];
  const settingsRequests = [];
  const unexpectedRequests = [];
  let onPage;
  function nextPage() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `No page emission; unexpected requests: ${JSON.stringify(unexpectedRequests)}`,
          ),
        );
      }, 5000);
      t.after(() => clearTimeout(timeout));
      onPage = (body) => {
        clearTimeout(timeout);
        resolve(JSON.parse(body));
      };
    });
  }
  function blockRequest(url) {
    unexpectedRequests.push(String(url));
    throw new Error(`Unexpected SDK request: ${url}`);
  }
  const fetch = async (input, init = {}) => {
    const url = String(input);
    if (
      url === 'https://cdn.example.test/v1/projects/SYNTHETIC_KEY/settings' &&
      !init.method
    ) {
      settingsRequests.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          integrations: {
            'Segment.io': { apiKey: 'SYNTHETIC_KEY', retryQueue: false },
          },
          metrics: { sampleRate: 0 },
        }),
      };
    }
    if (url === 'https://api.example.test/v1/p' && init.method === 'post') {
      bodies.push(init.body);
      onPage?.(init.body);
      return { ok: true, status: 200 };
    }
    return blockRequest(url);
  };
  expose('fetch', fetch);
  window.fetch = fetch;
  window.navigator.sendBeacon = blockRequest;
  window.XMLHttpRequest = class {
    constructor() {
      blockRequest('XMLHttpRequest');
    }
  };

  const snippet = readFileSync(
    new URL('../../docs/segment.js', import.meta.url),
    'utf8',
  )
    .replace(/var WRITE_KEY = '[^']+';/, "var WRITE_KEY = 'SYNTHETIC_KEY';")
    .replace(
      /var CDN_HOST = '[^']+';/,
      "var CDN_HOST = 'https://cdn.example.test';",
    )
    .replace(
      /var API_HOST = '[^']+';/,
      "var API_HOST = 'api.example.test/v1';",
    );
  window.eval(snippet);
  assert.deepEqual(
    Array.from(window.analytics, (call) => call[0]),
    ['addSourceMiddleware', 'page'],
  );
  assert.equal(
    window.document.querySelector('script[src]').src,
    'https://cdn.example.test/analytics.js/v1/SYNTHETIC_KEY/analytics.min.js',
  );

  const initialSent = nextPage();
  require('@segment/analytics-next/dist/cjs/browser/standalone.js');
  const initial = await initialSent;
  assert.equal(window.analytics.initialized, true);
  window.document.querySelector('link[rel="canonical"]').href =
    'https://docs.example.test/docs/next?key=ROUTE_CANONICAL_PRIVATE#ROUTE_CANONICAL_PRIVATE';
  const routeSent = nextPage();
  window.history.pushState(
    {},
    '',
    '/docs/next?key=ROUTE_PRIVATE&utm_source=ROUTE_CAMPAIGN_PRIVATE#ROUTE_HASH_PRIVATE',
  );
  const route = await routeSent;

  assert.equal(settingsRequests.length, 1);
  assert.equal(bodies.length, 2);
  assert.deepEqual(unexpectedRequests, []);
  for (const [event, expectedUrl] of [
    [initial, 'https://docs.example.test/docs/api'],
    [route, 'https://docs.example.test/docs/next'],
  ]) {
    assert.equal(event.type, 'page');
    for (const page of [event.properties, event.context.page]) {
      assert.equal(page.url, expectedUrl);
      assert.equal(page.referrer, 'https://portal.example.test');
      for (const key of ['search', 'query', 'hash'])
        assert.ok(!Object.hasOwn(page, key));
    }
    assert.ok(!Object.hasOwn(event.context, 'campaign'));
  }
  for (const body of bodies) {
    assert.ok(!body.includes('PRIVATE'), body);
    assert.ok(!body.includes('/private/account'), body);
  }
});
