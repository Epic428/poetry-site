import { parse } from "yaml";

export type Poem = {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  excerpt: string;
  featured: boolean;
  body: string;
};

type Frontmatter = {
  title?: unknown;
  date?: unknown;
  tags?: unknown;
  excerpt?: unknown;
  featured?: unknown;
};

function readMarkdown(raw: string): { data: Frontmatter; content: string } {
  const match = raw.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { data: {}, content: raw };

  const parsed: unknown = parse(match[1]);
  const data =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Frontmatter)
      : {};

  return { data, content: raw.slice(match[0].length) };
}

const modules = import.meta.glob("../content/poems/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const poems: Poem[] = Object.entries(modules)
  .map(([path, raw]) => {
    const { data, content } = readMarkdown(raw);
    return {
      slug: path.split("/").pop()!.replace(/\.md$/, ""),
      title: String(data.title ?? "Untitled"),
      date: String(data.date ?? ""),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      excerpt: String(data.excerpt ?? ""),
      featured: data.featured === true,
      body: content.trim(),
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

export const findPoem = (slug: string) => poems.find((p) => p.slug === slug);
