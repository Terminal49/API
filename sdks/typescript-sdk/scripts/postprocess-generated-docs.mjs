import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../../../docs/sdk/reference');
const routePrefix = '/sdk/reference';

function listMdxFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.mdx') ? [fullPath] : [];
  });
}

function frontmatterTitle(content, filePath) {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return h1.replace(/`/g, '');

  const basename = path.basename(filePath, '.mdx');
  if (basename === 'index') {
    const parent = path.basename(path.dirname(filePath));
    return parent === 'reference' ? 'TypeScript SDK API Reference' : parent;
  }
  return basename;
}

function routeForLink(filePath, linkTarget) {
  const [targetPath, hash = ''] = linkTarget.split('#');
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
