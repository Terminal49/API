/**
 * Terminal49 Help Center search (help.terminal49.com).
 * The Help Center holds the dashboard how-to articles (sharing views, alerts, billing) that the
 * Mintlify docs don't cover. Pylon publishes it as public HTML with a sitemap, so this reads the
 * sitemap, fetches each listed article, and ranks them locally. No credential is needed.
 */

export const HELP_CENTER_ORIGIN = 'https://help.terminal49.com';
const SITEMAP_URL = `${HELP_CENTER_ORIGIN}/sitemap.xml`;
const INDEX_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const FETCH_CONCURRENCY = 8;

export interface HelpArticle {
  title: string;
  url: string;
  text: string;
}

interface CachedIndex {
  articles: HelpArticle[];
  loadedAt: number;
}

let cached: CachedIndex | undefined;
let loading: Promise<HelpArticle[]> | undefined;

/** Clears the cached index. Tests only. */
export function resetHelpCenterIndex(): void {
  cached = undefined;
  loading = undefined;
}

export async function searchHelpCenter(
  query: string,
  limit: number,
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
): Promise<HelpArticle[]> {
  const articles = await loadIndex(fetchImpl, now);
  return rankArticles(articles, query).slice(0, limit);
}

async function loadIndex(
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<HelpArticle[]> {
  if (cached && now() - cached.loadedAt < INDEX_TTL_MS) return cached.articles;
  loading ??= buildIndex(fetchImpl)
    .then((articles) => {
      cached = { articles, loadedAt: now() };
      return articles;
    })
    .finally(() => {
      loading = undefined;
    });
  return loading;
}

async function buildIndex(fetchImpl: typeof fetch): Promise<HelpArticle[]> {
  const sitemap = await fetchText(SITEMAP_URL, fetchImpl);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter((url) => url.startsWith(`${HELP_CENTER_ORIGIN}/articles/`));

  const articles: HelpArticle[] = [];
  for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
    const batch = await Promise.allSettled(
      urls
        .slice(i, i + FETCH_CONCURRENCY)
        .map(async (url) => parseArticle(url, await fetchText(url, fetchImpl))),
    );
    for (const result of batch) {
      if (result.status === 'fulfilled' && result.value)
        articles.push(result.value);
    }
  }
  if (!articles.length) throw new Error('Help Center returned no articles.');
  return articles;
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Help Center request failed (HTTP ${response.status}).`);
  }
  return response.text();
}

export function parseArticle(url: string, html: string): HelpArticle | null {
  const rawTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
  const title = decodeEntities(rawTitle)
    .replace(/\s*\|\s*Terminal49 Knowledge Base\s*$/i, '')
    .trim();
  const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  let text = decodeEntities(
    body
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  // Article pages repeat the site chrome before the body; start at the title's last mention.
  const start = title ? text.lastIndexOf(title) : -1;
  if (start >= 0) text = text.slice(start + title.length).trim();
  text = text.replace(/^Last updated [^.]*? ago\s*/i, '');
  if (!title || !text) return null;
  return { title, url, text };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

const STOPWORDS = new Set(
  'a an and are as at be by can do does for from how i in into is it its me my of on or our so that the this to we what when where which who why will with without you your'.split(
    ' ',
  ),
);

// Light stemming so "share", "shared" and "sharing" match each other.
function stem(word: string): string {
  return word.length > 4 ? word.replace(/(ing|ed|es|s|e)$/, '') : word;
}

// Customers say "sign in" and "log in"; articles say "login".
function normalizePhrases(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(sign|log)[\s-]?(in|on|up)\b/g, 'login')
    .replace(/\bsignin\b/g, 'login');
}

function terms(text: string): string[] {
  return (normalizePhrases(text).match(/[a-z0-9]+/g) ?? [])
    .filter((word) => !STOPWORDS.has(word))
    .map(stem);
}

export function rankArticles(
  articles: HelpArticle[],
  query: string,
): HelpArticle[] {
  const queryTerms = [...new Set(terms(query))];
  if (!queryTerms.length) return [];
  return articles
    .map((article) => {
      const titleTerms = new Set(terms(article.title));
      const bodyTerms = terms(article.text);
      let score = 0;
      let matched = 0;
      for (const term of queryTerms) {
        const inTitle = titleTerms.has(term);
        const inBody = bodyTerms.filter((word) => word === term).length;
        if (inTitle || inBody) matched += 1;
        score += (inTitle ? 3 : 0) + Math.log1p(inBody);
      }
      return { article, score: score * (matched / queryTerms.length) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article);
}
