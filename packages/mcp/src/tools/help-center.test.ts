import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  HELP_CENTER_ORIGIN,
  parseArticle,
  rankArticles,
  resetHelpCenterIndex,
  searchHelpCenter,
} from './help-center.js';

const SHARING_URL = `${HELP_CENTER_ORIGIN}/articles/1-sharing-container-views`;
const ALERTS_URL = `${HELP_CENTER_ORIGIN}/articles/2-email-alerts`;

function page(title: string, body: string): string {
  return `<html><head><title>${title} | Terminal49 Knowledge Base</title><script>var x = 1;</script></head>
<body><nav>Contact Us</nav><article><h1>${title}</h1><p>Last updated 6 months ago</p>${body}</article></body></html>`;
}

const sitemap = `<?xml version="1.0"?><urlset>
<url><loc>${HELP_CENTER_ORIGIN}/collections/9-containers</loc></url>
<url><loc>${SHARING_URL}</loc></url>
<url><loc>${ALERTS_URL}</loc></url>
</urlset>`;

function site(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/sitemap.xml')) return new Response(sitemap);
    if (url === SHARING_URL) {
      return new Response(
        page(
          'Sharing Container Views',
          '<p>Share custom views with people who need access, without requiring a login. Click the share button and copy the link.</p>',
        ),
      );
    }
    if (url === ALERTS_URL) {
      return new Response(
        page(
          'Email Alerts',
          '<p>Choose which container events send you an email.</p>',
        ),
      );
    }
    return new Response('', { status: 404 });
  });
}

afterEach(() => resetHelpCenterIndex());

describe('parseArticle', () => {
  it('keeps the title and body text and drops markup, scripts and the updated line', () => {
    const article = parseArticle(
      SHARING_URL,
      page('Sharing &amp; Views', '<p>Click <b>Share</b>.</p>'),
    );
    expect(article).toEqual({
      title: 'Sharing & Views',
      url: SHARING_URL,
      text: 'Click Share .',
    });
  });
});

describe('rankArticles', () => {
  const articles = [
    {
      title: 'Email Alerts',
      url: ALERTS_URL,
      text: 'Choose which events send an email.',
    },
    {
      title: 'Sharing Container Views',
      url: SHARING_URL,
      text: 'Share views without requiring a login.',
    },
  ];

  it('matches word forms and ranks title matches first', () => {
    expect(
      rankArticles(articles, 'how to share this without sign in?')[0]?.url,
    ).toBe(SHARING_URL);
    expect(rankArticles(articles, 'shared view link')[0]?.url).toBe(
      SHARING_URL,
    );
    expect(rankArticles(articles, 'share without signing in')[0]?.url).toBe(
      SHARING_URL,
    );
  });

  it('returns nothing for stopword-only or unmatched queries', () => {
    expect(rankArticles(articles, 'how do I')).toEqual([]);
    expect(rankArticles(articles, 'vessel schedule')).toEqual([]);
  });
});

describe('searchHelpCenter', () => {
  it('indexes articles from the sitemap and returns the best match', async () => {
    const fetchImpl = site();
    const results = await searchHelpCenter('share without login', 5, fetchImpl);
    expect(results[0]).toMatchObject({
      title: 'Sharing Container Views',
      url: SHARING_URL,
    });
    expect(results[0]?.text).toContain('without requiring a login');
    const urls = fetchImpl.mock.calls.map(([input]) => String(input));
    expect(urls).not.toContain(
      `${HELP_CENTER_ORIGIN}/collections/9-containers`,
    );
  });

  it('reuses the cached index within the hour and refreshes after it', async () => {
    const fetchImpl = site();
    let now = 0;
    await searchHelpCenter('share', 5, fetchImpl, () => now);
    const calls = fetchImpl.mock.calls.length;
    now = 30 * 60 * 1000;
    await searchHelpCenter('alerts', 5, fetchImpl, () => now);
    expect(fetchImpl.mock.calls.length).toBe(calls);
    now = 61 * 60 * 1000;
    await searchHelpCenter('alerts', 5, fetchImpl, () => now);
    expect(fetchImpl.mock.calls.length).toBe(calls * 2);
  });

  it('shares one index build between concurrent searches', async () => {
    const fetchImpl = site();
    await Promise.all([
      searchHelpCenter('share', 5, fetchImpl),
      searchHelpCenter('alerts', 5, fetchImpl),
    ]);
    const sitemapCalls = fetchImpl.mock.calls.filter(([input]) =>
      String(input).endsWith('/sitemap.xml'),
    );
    expect(sitemapCalls).toHaveLength(1);
  });

  it('fails when the sitemap is unavailable, and retries on the next search', async () => {
    const down = vi.fn<typeof fetch>(
      async () => new Response('', { status: 503 }),
    );
    await expect(searchHelpCenter('share', 5, down)).rejects.toThrow(
      'HTTP 503',
    );
    const results = await searchHelpCenter('share', 5, site());
    expect(results[0]?.url).toBe(SHARING_URL);
  });
});
