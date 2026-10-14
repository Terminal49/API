import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  ['terminals', 'terminals'],
  ['ocean-carriers', 'shipping-lines'],
  ['rail', 'rail-carriers'],
  ['inland-rail-terminals', 'inland-rail-terminals'],
];
const tableRows = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        (line.startsWith('|') && !/^[| :-]+$/.test(line)) ||
        line.startsWith('SCAC `') ||
        line.includes('SMDG code:'),
    );

export async function verifyDeployedCoverage({
  baseUrl = 'https://terminal49.com/docs/',
  fetchImpl = fetch,
} = {}) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const checks = [];
  async function check(url, validate) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.text();
      await validate(body);
      checks.push({ url: String(url), passed: true });
    } catch (error) {
      checks.push({ url: String(url), passed: false, error: error.message });
    }
  }
  await check(new URL('llms.txt', base), (body) => {
    for (const [page] of pages) {
      const route = new URL('coverage/' + page, base).pathname;
      if (!body.includes(route)) throw new Error('Agent index missing ' + page);
    }
  });
  await Promise.all(
    pages.map(async ([page, slug]) => {
      const pageUrl = new URL('coverage/' + page, base);
      const markdownUrl = new URL(pageUrl + '.md');
      const htmlDownloads = new Map();
      const markdownDownloads = new Map();
      function findDownloads(body, downloads, required = true) {
        const extensions = new Set();
        const links = [...body.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)];
        for (const match of links) {
          const url = new URL(match[1] ?? match[2], pageUrl);
          for (const extension of ['json', 'csv']) {
            if (url.pathname.endsWith('/' + slug + '.' + extension)) {
              downloads.set(String(url), url);
              extensions.add(extension);
            }
          }
        }
        for (const extension of ['json', 'csv']) {
          if (required && !extensions.has(extension))
            throw new Error('Missing ' + extension + ' download link');
        }
      }
      await check(pageUrl, (body) => findDownloads(body, htmlDownloads, false));
      async function verifyMarkdown(url, file, downloads) {
        const expected = await readFile(resolve(root, file), 'utf8');
        await check(url, (body) => {
          const rows = tableRows(expected);
          if (!rows.length || !isDeepStrictEqual(tableRows(body), rows))
            throw new Error('Literal feature tables differ from this checkout');
          for (const line of expected
            .split('\n')
            .filter(
              (line) =>
                line.startsWith('SCAC `') || line.includes('SMDG code:'),
            )) {
            if (!body.includes(line))
              throw new Error('Missing identifier ' + line);
          }
          if (downloads) findDownloads(body, downloads);
        });
      }
      await verifyMarkdown(
        markdownUrl,
        'docs/coverage/' + page + '.mdx',
        markdownDownloads,
      );
      await verifyMarkdown(
        new URL('data/coverage/' + slug + '.md', base),
        'docs/data/coverage/' + slug + '.mdx',
      );
      const urls = new Map(
        [...htmlDownloads, ...markdownDownloads].map(([, url]) => [
          String(url),
          url,
        ]),
      );
      for (const [, url] of htmlDownloads) urls.set(String(url), url);
      await Promise.all(
        [...urls.values()].map(async (url) => {
          const expected = await readFile(
            resolve(
              root,
              'docs/data/coverage/',
              url.pathname.split('/').at(-1),
            ),
            'utf8',
          );
          await check(url, (body) => {
            if (url.pathname.endsWith('.json')) {
              if (!isDeepStrictEqual(JSON.parse(body), JSON.parse(expected)))
                throw new Error('JSON snapshot differs from this checkout');
            } else if (
              body.replaceAll('\r\n', '\n') !==
              expected.replaceAll('\r\n', '\n')
            ) {
              throw new Error('CSV snapshot differs from this checkout');
            }
          });
        }),
      );
    }),
  );
  checks.sort((a, b) => a.url.localeCompare(b.url));
  return {
    checkedAt: new Date().toISOString(),
    passed: checks.every((check) => check.passed),
    checks,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = await verifyDeployedCoverage({ baseUrl: process.argv[2] });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.passed) process.exitCode = 1;
}
