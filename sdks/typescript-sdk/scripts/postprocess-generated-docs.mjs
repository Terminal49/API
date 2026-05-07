/**
 * Post-processes TypeDoc-generated MDX files so they work with Mintlify.
 *
 * Runs automatically after TypeDoc via `npm run docs`. Transforms:
 *  1. Rewrites relative `.mdx` links to absolute Mintlify routes.
 *  2. Prepends YAML frontmatter with a `title` (required by docs/AGENTS.md).
 *  3. Cleans up module page titles (e.g. "client" → "Client Module").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../../../docs/sdk/reference');
const routePrefix = '/sdk/reference';

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
  const title = frontmatterTitle(content, filePath);
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${content}`;
}

for (const filePath of listMdxFiles(outputDir)) {
  const original = fs.readFileSync(filePath, 'utf8');
  const withLinks = rewriteMdxLinks(original, filePath);
  const withFrontmatter = ensureFrontmatter(withLinks, filePath);
  fs.writeFileSync(filePath, withFrontmatter);
}
