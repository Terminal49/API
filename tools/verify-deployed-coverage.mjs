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
        /^#{2,6} /.test(line) ||
        line.startsWith('SCAC `') ||
        line.includes('SMDG code:'),
    );

const markdownLinks = (body) =>
  [...body.matchAll(/(?<!!)\]\(([^)]+)\)/g)].map((match) => match[1]);
const htmlLinks = (body) =>
  [
    ...body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .matchAll(/<a\b((?:[^"'>]|"[^"]*"|'[^']*')*)>/gi),
  ].flatMap((tag) => {
    const attributes = [
      ...tag[1].matchAll(
        /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
      ),
    ];
    const href = attributes.find(
      (attribute) => attribute[1].toLowerCase() === 'href',
    );
    const value = href?.[2] ?? href?.[3] ?? href?.[4];
    return value === undefined ? [] : [value.replaceAll('&amp;', '&')];
  });

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
    const destinations = new Set(
      markdownLinks(body).map((link) => String(new URL(link, base))),
    );
    for (const [page] of pages) {
      const destination = String(new URL('coverage/' + page, base));
      if (
        !destinations.has(destination) &&
        !destinations.has(destination + '.md')
      )
        throw new Error('Agent index missing ' + page);
    }
  });
  await Promise.all(
    pages.map(async ([page, slug]) => {
      const pageUrl = new URL('coverage/' + page, base);
      const markdownUrl = new URL(pageUrl + '.md');
      const htmlDownloads = new Map();
      const markdownDownloads = new Map();
      const referenceDownloads = new Map();
      function findDownloads(
        links,
        downloads,
        sourceUrl,
        required = ['json', 'csv'],
      ) {
        const extensions = new Set();
        for (const link of links) {
          const url = new URL(link, sourceUrl);
          const extension = url.pathname.match(/\.(json|csv)$/)?.[1];
          if (extension) {
            downloads.set(String(url), url);
            if (url.pathname.endsWith('/' + slug + '.' + extension))
              extensions.add(extension);
          }
        }
        for (const extension of required) {
          if (!extensions.has(extension))
            throw new Error('Missing ' + extension + ' download link');
        }
      }
      await check(pageUrl, (body) =>
        findDownloads(htmlLinks(body), htmlDownloads, pageUrl),
      );
      async function verifyMarkdown(url, file, downloads) {
        const expected = await readFile(resolve(root, file), 'utf8');
        await check(url, (body) => {
          const rows = tableRows(expected);
          if (!rows.length || !isDeepStrictEqual(tableRows(body), rows))
            throw new Error('Literal feature tables differ from this checkout');
          const required = [
            ...new Set(
              markdownLinks(expected)
                .map(
                  (link) =>
                    new URL(link, url).pathname.match(/\.(json|csv)$/)?.[1],
                )
                .filter(Boolean),
            ),
          ];
          findDownloads(markdownLinks(body), downloads, url, required);
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
        referenceDownloads,
      );
      const urls = new Map([
        ...htmlDownloads,
        ...markdownDownloads,
        ...referenceDownloads,
      ]);
      await Promise.all(
        [...urls.values()].map(async (url) => {
          await check(url, async (body) => {
            const filename = url.pathname.split('/').at(-1);
            const extension = filename.split('.').at(-1);
            if (filename !== slug + '.' + extension)
              throw new Error('Unexpected download filename ' + filename);
            const expected = await readFile(
              resolve(root, 'docs/data/coverage/', filename),
              'utf8',
            );
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
