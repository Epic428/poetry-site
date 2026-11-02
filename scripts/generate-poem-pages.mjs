import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const POEMS = path.join(ROOT, "src", "content", "poems");
const SITE = "https://nocturnepoetry.com";
const IMAGE = `${SITE}/og-default.png`;

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function replaceHead(html, tags) {
    const cleaned = html
        .replace(/<meta\b[^>]*>/gi, (tag) => {
            if (
                /\b(?:name|property)=["'](?:description|og:[^"']+|twitter:[^"']+)["']/i.test(tag)
            ) {
                return "";
            }
            return tag;
        })
        .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");

    return cleaned.replace("</head>", `${tags}\n</head>`);
}

function getFrontmatter(markdown) {
    const match = /^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(markdown);

    if (!match) {
        throw new Error("Poem is missing YAML frontmatter");
    }

    const data = parse(match[1]);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid YAML frontmatter");
    }

    return data;
}

function poemMetadata({ title, excerpt, slug }) {
    const pageTitle = `${title} | Nocturne`;
    const url = `${SITE}/poems/${encodeURIComponent(slug)}`;
    const description = String(excerpt ?? "")
        .replace(/\s+/g, " ")
        .trim() || `Read ${title}, a poem from Nocturne.`;

    return `
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Nocturne" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:image" content="${IMAGE}" />
    <meta property="og:image:alt" content="Nocturne — Words for quieter moments." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${IMAGE}" />
  `;
}

async function main() {
    const template = await readFile(path.join(DIST, "index.html"), "utf8");
    const files = (await readdir(POEMS)).filter(file => file.endsWith(".md"));

    for (const file of files) {
        const markdown = await readFile(path.join(POEMS, file), "utf8");
        const data = getFrontmatter(markdown);
        const slug = path.basename(file, ".md");

        const title = String(data.title ?? "Untitled");
        const metadata = poemMetadata({
            title,
            excerpt: data.excerpt,
            slug,
        });

        const html = replaceHead(
            template.replace(
                /<title>[\s\S]*?<\/title>/i,
                `<title>${escapeHtml(title)} | Nocturne</title>`
            ),
            metadata
        );

        const directory = path.join(DIST, "poems", slug);
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "index.html"), html, "utf8");

        console.log(`Generated /poems/${slug}`);
    }

    console.log(`Generated ${files.length} poem preview pages.`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
