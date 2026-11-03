import { createRemoteJWKSet, jwtVerify } from "jose";
import { stringify } from "yaml";

interface Env {
    GITHUB_TOKEN: string;
    GITHUB_OWNER: string;
    GITHUB_REPO: string;
    GITHUB_BRANCH: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    ADMIN_EMAIL: string;
}

type PoemInput = {
    title: string;
    date: string;
    tags: string[];
    excerpt: string;
    featured: boolean;
    body: string;
};

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

function slugify(title: string): string {
    return title
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const parsed = new Date(`${value}T00:00:00Z`);

    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
    );
}

function validatePoem(value: unknown): PoemInput {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid poem data.");
    }

    const p = value as Record<string, unknown>;

    if (
        typeof p.title !== "string" ||
        !p.title.trim() ||
        p.title.length > 200
    ) {
        throw new Error("Title must be 1–200 characters.");
    }

    if (typeof p.date !== "string" || !isValidDate(p.date)) {
        throw new Error("Date must be a valid YYYY-MM-DD date.");
    }

    if (
        !Array.isArray(p.tags) ||
        p.tags.length > 20 ||
        !p.tags.every(
            (tag) =>
                typeof tag === "string" &&
                tag.trim().length > 0 &&
                tag.length <= 50
        )
    ) {
        throw new Error("Tags must contain up to 20 valid tags.");
    }

    if (
        typeof p.excerpt !== "string" ||
        p.excerpt.length > 1000
    ) {
        throw new Error("Excerpt must be 1000 characters or fewer.");
    }

    if (typeof p.featured !== "boolean") {
        throw new TypeError("Featured must be true or false.");
    }

    if (
        typeof p.body !== "string" ||
        !p.body.trim() ||
        p.body.length > 50000
    ) {
        throw new Error("Poem body must be 1–50,000 characters.");
    }

    return {
        title: p.title.trim(),
        date: p.date,
        tags: p.tags.map((tag: string) => tag.trim()),
        excerpt: p.excerpt.trim(),
        featured: p.featured,
        body: p.body.trim(),
    };
}

function toMarkdown(poem: PoemInput): string {
    const frontmatter = stringify({
        title: poem.title,
        date: poem.date,
        tags: poem.tags,
        excerpt: poem.excerpt,
        featured: poem.featured,
    });

    return `---\n${frontmatter}---\n\n${poem.body}\n`;
}

function toBase64(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = "";

    for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCodePoint(...bytes.subarray(i, i + 8192));
    }

    return btoa(binary);
}

async function authorize(
    request: Request,
    env: Env
): Promise<boolean> {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");

    if (!token) return false;

    const team = env.ACCESS_TEAM_DOMAIN;
    const issuer = `https://${team}`;

    const jwks = createRemoteJWKSet(
        new URL(`${issuer}/cdn-cgi/access/certs`)
    );

    try {
        const { payload } = await jwtVerify(token, jwks, {
            issuer,
            audience: env.ACCESS_AUD,
            algorithms: ["RS256"],
        });

        return (
            typeof payload.email === "string" &&
            payload.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()
        );
    } catch {
        return false;
    }
}

async function githubRequest(
    url: string,
    env: Env,
    method = "GET",
    body?: unknown
): Promise<Response> {
    return fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "Nocturne-Admin-Worker",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function createPoem(
    poem: PoemInput,
    env: Env
): Promise<Response> {
    const slug = slugify(poem.title);

    if (!slug || slug.length > 150) {
        return json({ error: "Invalid or excessively long filename." }, 400);
    }

    const path = `src/content/poems/${slug}.md`;

    const url =
        `https://api.github.com/repos/` +
        `${encodeURIComponent(env.GITHUB_OWNER)}/` +
        `${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;

    const existing = await githubRequest(
        `${url}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
        env
    );

    if (existing.status === 200) {
        return json(
            { error: "A poem with this filename already exists." },
            409
        );
    }

    if (existing.status !== 404) {
        return json(
            { error: "Unable to check whether the poem already exists." },
            502
        );
    }

    const markdown = toMarkdown(poem);

    const result = await githubRequest(url, env, "PUT", {
        message: `Add poem: ${poem.title}`,
        content: toBase64(markdown),
        branch: env.GITHUB_BRANCH,
    });

    if (result.status === 201) {
        return json(
            {
                success: true,
                slug,
                path,
                message: "Poem committed successfully.",
            },
            201
        );
    }

    if (result.status === 409 || result.status === 422) {
        return json(
            {
                error:
                    "GitHub rejected the commit. The filename may already exist, " +
                    "or the branch may have changed. Check GitHub before retrying.",
            },
            409
        );
    }

    console.error("GitHub commit failed", result.status);

    return json(
        { error: "GitHub could not create the poem." },
        502
    );
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (!url.pathname.startsWith("/api/")) {
            return json({ error: "Not found." }, 404);
        }

        if (url.pathname !== "/api/poems") {
            return json({ error: "Not found." }, 404);
        }

        if (request.method !== "POST") {
            return json({ error: "Method not allowed." }, 405);
        }

        if (
            !env.GITHUB_TOKEN ||
            !env.ACCESS_TEAM_DOMAIN ||
            !env.ACCESS_AUD ||
            !env.ADMIN_EMAIL
        ) {
            return json({ error: "Server configuration incomplete." }, 503);
        }

        if (!(await authorize(request, env))) {
            return json({ error: "Unauthorized." }, 401);
        }

        // Only allow requests originating from the admin application.
        const origin = request.headers.get("Origin");

        if (origin !== "https://admin.nocturnepoetry.com") {
            return json({ error: "Invalid request origin." }, 403);
        }

        const contentType = request.headers.get("Content-Type") ?? "";

        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
            return json({ error: "Expected JSON." }, 415);
        }

        // Limit the actual request body, not only Content-Length.
        let raw: string;

        try {
            const reader = request.body?.getReader();

            if (!reader) return json({ error: "Missing body." }, 400);

            const decoder = new TextDecoder();
            let size = 0;
            let output = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                size += value.byteLength;

                if (size > 100_000) {
                    await reader.cancel();
                    return json({ error: "Request too large." }, 413);
                }

                output += decoder.decode(value, { stream: true });
            }

            raw = output + decoder.decode();
        } catch {
            return json({ error: "Unable to read request." }, 400);
        }

        let input: unknown;

        try {
            input = JSON.parse(raw);
        } catch {
            return json({ error: "Invalid JSON." }, 400);
        }

        let poem: PoemInput;

        try {
            poem = validatePoem(input);
        } catch (error) {
            return json(
                {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Invalid poem.",
                },
                400
            );
        }

        try {
            return await createPoem(poem, env);
        } catch (error) {
            console.error("Poem submission failed", error);
            return json({ error: "Internal server error." }, 500);
        }
    },
};
