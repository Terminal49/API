/**
 * Segment analytics.js v5.2.1 loader for the Mintlify docs site.
 *
 * Based on the official snippet from:
 * https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/website/javascript/quickstart
 *
 * Routes the CDN and API hosts through our Cloudflare Workers so
 * adblockers don't drop events — matching how app.terminal49.com and
 * terminal49.com already ship Segment.
 *
 * We use a custom script instead of Mintlify's built-in
 * `integrations.segment` config because it only accepts a write key
 * and loads directly from cdn.segment.com (no proxy support).
 */
(function () {
  var WRITE_KEY = 'QGH911NkPhgr2Ai31FL9EZYphywFL7j2';
  var CDN_HOST = 'https://cdn-segment-worker.t49.workers.dev';
  var API_HOST = 'api-segment-worker.t49.workers.dev/v1';

  var i = 'analytics';
  var analytics = (window[i] = window[i] || []);

  if (analytics.initialize) return;

  if (analytics.invoked) {
    if (window.console && console.error) {
      console.error('Segment snippet included twice.');
    }
    return;
  }

  analytics.invoked = true;

  analytics.methods = [
    'trackSubmit',
    'trackClick',
    'trackLink',
    'trackForm',
    'pageview',
    'identify',
    'reset',
    'group',
    'track',
    'ready',
    'alias',
    'debug',
    'page',
    'screen',
    'once',
    'off',
    'on',
    'addSourceMiddleware',
    'addIntegrationMiddleware',
    'setAnonymousId',
    'addDestinationMiddleware',
    'register',
  ];

  analytics.factory = function (e) {
    return function () {
      if (window[i].initialized) {
        return window[i][e].apply(window[i], arguments);
      }
      var n = Array.prototype.slice.call(arguments);
      if (
        ['track', 'screen', 'alias', 'group', 'page', 'identify'].indexOf(e) >
        -1
      ) {
        var c = document.querySelector("link[rel='canonical']");
        n.push({
          __t: 'bpc',
          c: (c && c.getAttribute('href')) || void 0,
          p: location.pathname,
          u: location.href,
          s: location.search,
          t: document.title,
          r: document.referrer,
        });
      }
      n.unshift(e);
      analytics.push(n);
      return analytics;
    };
  };

  for (var n = 0; n < analytics.methods.length; n++) {
    var key = analytics.methods[n];
    analytics[key] = analytics.factory(key);
  }

  analytics.load = function (key, options) {
    var t = document.createElement('script');
    t.type = 'text/javascript';
    t.async = true;
    t.setAttribute('data-global-segment-analytics-key', i);
    t.src = CDN_HOST + '/analytics.js/v1/' + key + '/analytics.min.js';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(t, first);
    analytics._loadOptions = options;
  };

  analytics._writeKey = WRITE_KEY;
  analytics.SNIPPET_VERSION = '5.2.1';

  analytics.load(WRITE_KEY, {
    integrations: { 'Segment.io': { apiHost: API_HOST } },
  });
  analytics.page();

  // Mintlify is a SPA — analytics.js doesn't auto-track client-side
  // navigation, so fire analytics.page() on every route change.
  var origPushState = history.pushState;
  var origReplaceState = history.replaceState;
  function firePage() {
    if (window.analytics && typeof window.analytics.page === 'function') {
      window.analytics.page();
    }
  }
  history.pushState = function () {
    var ret = origPushState.apply(this, arguments);
    firePage();
    return ret;
  };
  history.replaceState = function () {
    var ret = origReplaceState.apply(this, arguments);
    firePage();
    return ret;
  };
  window.addEventListener('popstate', firePage);
})();
