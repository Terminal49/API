/** Wipe the TypeDoc output directory before regeneration. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../../../docs/sdk/reference');
const frontmatterCachePath = path.join(
  os.tmpdir(),
  'terminal49-sdk-docs-frontmatter-cache.json',
);

function listMdxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.mdx') ? [fullPath] : [];
  });
}

function frontmatterFor(content) {
  return content.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
}

const frontmatterByPath = {};
for (const filePath of listMdxFiles(outputDir)) {
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = frontmatterFor(content);
  if (!frontmatter) continue;

  const relativePath = path
    .relative(outputDir, filePath)
    .split(path.sep)
    .join(path.posix.sep);
  frontmatterByPath[relativePath] = frontmatter;
}

fs.writeFileSync(frontmatterCachePath, JSON.stringify(frontmatterByPath));

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
