import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

function analyticsPage() {
  const window = { addEventListener() {} };
  const document = {
    title: 'API reference',
    referrer: 'https://portal.example.test/private/account?key=PRIVATE#PRIVATE',
    querySelector: () => ({
      getAttribute: () =>
        'https://docs.example.test/docs/api?key=PRIVATE#PRIVATE',
    }),
    createElement: () => ({ setAttribute() {} }),
    getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
  };
  vm.runInNewContext(read('docs/segment.js'), {
    window,
    document,
    URL,
    location: new URL('https://docs.example.test/docs/api?key=PRIVATE#PRIVATE'),
    history: { pushState() {}, replaceState() {} },
  });
  return window.analytics;
}

test('docs analytics queue excludes private navigation components', () => {
  const analytics = analyticsPage();
  const page = analytics.find((entry) => entry[0] === 'page');
  assert.ok(page);
  assert.ok(!JSON.stringify(page).includes('PRIVATE'));
  assert.ok(!JSON.stringify(page).includes('/private/account'));
});

test('docs source middleware removes navigation data added by the analytics SDK', () => {
  const analytics = analyticsPage();
  const middleware = analytics.find(
    (entry) => entry[0] === 'addSourceMiddleware',
  )?.[1];
  assert.equal(typeof middleware, 'function');
  const page = {
    url: 'https://docs.example.test/docs/api?key=PRIVATE#PRIVATE',
    search: '?key=PRIVATE',
    referrer: 'https://portal.example.test/private/account?key=PRIVATE',
  };
  const payload = {
    obj: {
      type: 'page',
      context: { page: { ...page } },
      properties: { ...page },
    },
  };
  let forwarded;
  middleware({
    payload,
    next: (value) => {
      forwarded = value;
    },
  });
  assert.equal(forwarded, payload);
  assert.ok(!JSON.stringify(payload).includes('PRIVATE'));
  assert.ok(!JSON.stringify(payload).includes('/private/account'));
  assert.equal(
    payload.obj.context.page.url,
    'https://docs.example.test/docs/api',
  );
  assert.equal(
    payload.obj.context.page.referrer,
    'https://portal.example.test',
  );
});
