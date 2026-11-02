import { describe, expect, it, vi } from 'vite-plus/test';
import {
  HELP_CENTER_ORIGIN,
  parseArticle,
  rankArticles,
  termWeights,
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

  it('weights words rare in the catalog over common ones, and does not reward length alone', () => {
    const catalog = [
      {
        title: 'Container Columns',
        url: 'u1',
        text: 'container container container view view view list of columns',
      },
      {
        title: 'Container Statuses',
        url: 'u2',
        text: 'container statuses explained',
      },
      {
        title: 'Container Holds',
        url: 'u3',
        text: 'container holds explained',
      },
      {
        title: 'Sharing Views',
        url: 'u4',
        text: 'share a view without a login',
      },
    ];
    const weight = termWeights(catalog);
    expect(weight('share')).toBeGreaterThan(weight('container'));
    expect(
      rankArticles(catalog, 'share container view without login', weight)[0]
        ?.url,
    ).toBe('u4');
  });

  it('returns nothing for stopword-only or unmatched queries', () => {
    expect(rankArticles(articles, 'how do I')).toEqual([]);
    expect(rankArticles(articles, 'vessel schedule')).toEqual([]);
  });
});

describe('searchHelpCenter', () => {
  it('ranks the sitemap slugs and fetches only the top articles', async () => {
    const fetchImpl = site();
    const results = await searchHelpCenter(
      'how to share without signing in',
      1,
      fetchImpl,
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: 'Sharing Container Views',
      url: SHARING_URL,
    });
    expect(results[0]?.text).toContain('without requiring a login');
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      `${HELP_CENTER_ORIGIN}/sitemap.xml`,
      SHARING_URL,
    ]);
  });

  it('skips an article that fails to load', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/sitemap.xml')
        ? new Response(sitemap)
        : new Response('', { status: 500 }),
    );
    expect(await searchHelpCenter('sharing', 5, fetchImpl)).toEqual([]);
  });

  it('fails when the sitemap is unavailable', async () => {
    const down = vi.fn<typeof fetch>(
      async () => new Response('', { status: 503 }),
    );
    await expect(searchHelpCenter('share', 5, down)).rejects.toThrow(
      'HTTP 503',
    );
  });
});
