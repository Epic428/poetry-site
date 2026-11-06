import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const folder = path.join(root, "src/content/poems");
const poems = await Promise.all((await readdir(folder)).filter(n => n.endsWith(".md")).map(async filename => {
  const raw = await readFile(path.join(folder, filename), "utf8");
  const match = /^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(raw);
  if (!match) throw new Error("Missing frontmatter: " + filename);
  const data = parse(match[1]);
  const slug = filename.slice(0, -3);
  if (!/^[a-z0-9_-]+$/.test(slug)) throw new Error("Invalid poem slug: " + slug);
  const title = String(data?.title ?? "").trim();
  const excerpt = String(data?.excerpt ?? "").trim();
  const date = String(data?.date ?? "");
  if (!title || title.length > 200 || excerpt.length > 1000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error("Invalid metadata: " + filename);
  return { slug, title, excerpt, date };
}));
poems.sort((a,b) => a.slug.localeCompare(b.slug));
await writeFile(path.join(root, "dist/poems-manifest.json"), JSON.stringify({ version: 1, poems }) + "\n");
console.log("Generated public poem manifest (" + poems.length + " poems).");
