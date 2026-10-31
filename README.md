# Nocturne Poetry Site

A dark, purple-accented React + TypeScript poetry site. Poems are Markdown files.

## Local development

Requires Node.js 22+.

```bash
npm install
npm run dev
npm run build
```

## Add a poem

Create a new file in `src/content/poems/` with front matter:

```md
---
title: "My Poem"
date: "2026-10-30"
tags: ["night", "reflection"]
excerpt: "A short summary."
featured: false
---

Your poem here.
```

Commit the file to publish on the next build. Edit `src/pages/About.tsx` for your biography.

## Cloudflare Pages

Connect this GitHub repository to Cloudflare Pages. Build command: `npm run build`; output directory: `dist`; Node version: 22 (set `NODE_VERSION=22` if necessary). `public/_redirects` handles client-side routes. No secrets required.

The existing LICENSE remains unchanged.
