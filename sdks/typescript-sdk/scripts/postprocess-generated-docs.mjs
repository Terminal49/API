/**
 * Post-processes TypeDoc-generated MDX files so they work with Mintlify.
 *
 * Runs automatically after TypeDoc via `npm run docs`. Transforms:
 *  1. Rewrites relative `.mdx` links to absolute Mintlify routes.
 *  2. Prepends YAML frontmatter with a `title` (required by docs/AGENTS.md).
 *  3. Cleans up module page titles (e.g. "client" → "Client Module").
 *  4. Applies hand-authored SEO title/description overrides from
 *     `seo-overrides.json` so regeneration stays reproducible (CI enforces
 *     `git diff --exit-code` on the generated output).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../../../docs/sdk/reference');
const routePrefix = '/sdk/reference';

/**
 * SEO frontmatter overrides keyed by route-relative `.mdx` path.
 * TypeDoc cannot emit these, so they live in a sidecar file that ships with
 * the generator; edit `seo-overrides.json` rather than the generated MDX.
 */
const seoOverridesPath = path.resolve(__dirname, '../seo-overrides.json');
const SEO_OVERRIDES = fs.existsSync(seoOverridesPath)
  ? JSON.parse(fs.readFileSync(seoOverridesPath, 'utf8'))
  : {};

/** Human-readable overrides for module index page titles. */
const MODULE_TITLE_OVERRIDES = {
  client: 'Client Module',
  models: 'Models',
  options: 'Options',
};

function listMdxFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.mdx') ? [fullPath] : [];
  });
}

function frontmatterTitle(content, filePath) {
  const basename = path.basename(filePath, '.mdx');

  // For index pages, prefer human-readable overrides over the raw H1.
  if (basename === 'index') {
    const parent = path.basename(path.dirname(filePath));
    if (parent === 'reference') return 'TypeScript SDK API Reference';
    if (MODULE_TITLE_OVERRIDES[parent]) return MODULE_TITLE_OVERRIDES[parent];
  }

  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return h1.replace(/`/g, '').replace(/\\([<>])/g, '$1');

  return basename;
}

function routeForLink(filePath, linkTarget) {
  const hashIdx = linkTarget.indexOf('#');
  const targetPath = hashIdx >= 0 ? linkTarget.slice(0, hashIdx) : linkTarget;
  const hash = hashIdx >= 0 ? linkTarget.slice(hashIdx + 1) : '';
  const currentDir = path.relative(outputDir, path.dirname(filePath)).split(path.sep).join(path.posix.sep);
  const resolved = path.posix.normalize(path.posix.join(currentDir, targetPath));
  const withoutExt = resolved.replace(/\.mdx$/, '').replace(/\/index$/, '');
  const route = withoutExt ? `${routePrefix}/${withoutExt}` : routePrefix;
  return hash ? `${route}#${hash}` : route;
}

function rewriteMdxLinks(content, filePath) {
  return content.replace(/\]\((?!https?:|mailto:|#)([^)]+?\.mdx(?:#[^)]+)?)\)/g, (_match, target) => {
    return `](${routeForLink(filePath, target)})`;
  });
}

function ensureFrontmatter(content, filePath) {
  if (content.startsWith('---\n')) return content;
  const relKey = path.relative(outputDir, filePath).split(path.sep).join(path.posix.sep);
  const override = SEO_OVERRIDES[relKey];
  const title = override?.title ?? frontmatterTitle(content, filePath);
  const lines = [`title: ${JSON.stringify(title)}`];
  if (override?.description) lines.push(`description: ${JSON.stringify(override.description)}`);
  return `---\n${lines.join('\n')}\n---\n\n${content}`;
}

for (const filePath of listMdxFiles(outputDir)) {
  const original = fs.readFileSync(filePath, 'utf8');
  const withLinks = rewriteMdxLinks(original, filePath);
  const withFrontmatter = ensureFrontmatter(withLinks, filePath);
  fs.writeFileSync(filePath, withFrontmatter);
}
