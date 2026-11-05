import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const SITE = "https://nocturnepoetry.com";
const POEMS = path.join(ROOT, "src", "content", "poems");
const OUTPUT = path.join(ROOT, "dist", "rss.xml");

function escapeXml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function frontmatter(markdown, filename) {
    const match = /^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(markdown);
    if (!match) throw new Error(`Missing YAML frontmatter: ${filename}`);
    const data = parse(match[1]);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(`Invalid YAML frontmatter: ${filename}`);
    }
    return data;
}

function publishedDate(value, filename) {
    const date = String(value ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Expected YYYY-MM-DD date in ${filename}`);
    }
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new Error(`Invalid date in ${filename}`);
    }
    return parsed.toUTCString();
}

async function main() {
    const filenames = (await readdir(POEMS)).filter((name) => name.endsWith(".md"));
    const poems = await Promise.all(filenames.map(async (filename) => {
        const markdown = await readFile(path.join(POEMS, filename), "utf8");
        const data = frontmatter(markdown, filename);
        const slug = path.basename(filename, ".md");
        const date = String(data.date ?? "");
        const title = String(data.title ?? "Untitled").trim();
        const excerpt = String(data.excerpt ?? "").trim();
        return {
            date,
            title,
            excerpt,
            url: `${SITE}/poems/${encodeURIComponent(slug)}`,
            pubDate: publishedDate(date, filename),
        };
    }));

    poems.sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));

    const items = poems.map(({ title, excerpt, url, pubDate }) => `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(excerpt || `Read ${title}, a poem from Nocturne.`)}</description>
    </item>`).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Nocturne — Poetry</title>
    <link>${SITE}/</link>
    <description>New poems from Nocturne — words for quieter moments.</description>
    <language>en</language>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

    await writeFile(OUTPUT, xml, "utf8");
    console.log(`Generated /rss.xml with ${poems.length} poems.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
