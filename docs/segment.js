/* eslint-disable */
/**
 * Segment analytics.js loader for the Mintlify docs site.
 *
 * Loaded automatically by Mintlify as a custom script on every page.
 * Routes the CDN and ingest hosts through our Cloudflare Workers so
 * adblockers don't drop events — matching how app.terminal49.com and
 * terminal49.com already ship Segment.
 *
 * We do NOT use Mintlify's built-in `integrations.segment` config
 * because it only accepts a write key and loads directly from
 * cdn.segment.com / api.segment.io (no proxy support).
 */
(function () {
  var WRITE_KEY = 'QGH911NkPhgr2Ai31FL9EZYphywFL7j2';
  var CDN_HOST = 'https://cdn-segment-worker.t49.workers.dev';
  var API_HOST = 'api-segment-worker.t49.workers.dev/v1';

  var analytics = (window.analytics = window.analytics || []);
  if (analytics.initialize) return;
  if (analytics.invoked) {
    if (window.console && console.error) {
      console.error('Segment snippet included twice.');
    }
    return;
  }
  analytics.invoked = true;
  analytics.methods = [
    'trackSubmit', 'trackClick', 'trackLink', 'trackForm', 'pageview',
    'identify', 'reset', 'group', 'track', 'ready', 'alias', 'debug',
    'page', 'once', 'off', 'on', 'addSourceMiddleware',
    'addIntegrationMiddleware', 'setAnonymousId', 'addDestinationMiddleware',
  ];
  analytics.factory = function (method) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(method);
      analytics.push(args);
      return analytics;
    };
  };
  for (var i = 0; i < analytics.methods.length; i++) {
    var key = analytics.methods[i];
    analytics[key] = analytics.factory(key);
  }
  analytics.load = function (key, opts) {
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = CDN_HOST + '/analytics.js/v1/' + key + '/analytics.min.js';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(script, first);
    analytics._loadOptions = opts;
  };
  analytics._writeKey = WRITE_KEY;
  analytics.SNIPPET_VERSION = '4.15.3';
  analytics.load(WRITE_KEY, {
    integrations: { 'Segment.io': { apiHost: API_HOST } },
  });
  analytics.page();

  // Mintlify is a SPA — analytics.js v1 doesn't auto-track route changes,
  // so patch history + listen to popstate to fire analytics.page() on
  // every client-side navigation.
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
