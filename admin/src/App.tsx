import { useMemo, useState } from "react";
import { stringify } from "yaml";

type PoemDraft = {
    title: string;
    date: string;
    tags: string;
    excerpt: string;
    featured: boolean;
    body: string;
};

function todayLocal(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function makeSlug(title: string): string {
    return title
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function generateMarkdown(draft: PoemDraft): string {
    const tags = draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

    const frontmatter = stringify({
        title: draft.title.trim(),
        date: draft.date,
        tags,
        excerpt: draft.excerpt.trim(),
        featured: draft.featured,
    });

    return `---\n${frontmatter}---\n\n${draft.body.trim()}\n`;
}

export default function App() {
    const [draft, setDraft] = useState<PoemDraft>({
        title: "",
        date: todayLocal(),
        tags: "",
        excerpt: "",
        featured: false,
        body: "",
    });

    const [preview, setPreview] = useState(false);
    const [copied, setCopied] = useState(false);

    const slug = useMemo(
        () => makeSlug(draft.title),
        [draft.title]
    );

    const markdown = useMemo(
        () => generateMarkdown(draft),
        [draft]
    );

    function update<K extends keyof PoemDraft>(
        field: K,
        value: PoemDraft[K]
    ) {
        setDraft((previous) => ({
            ...previous,
            [field]: value,
        }));
        setCopied(false);
    }

    async function copyMarkdown() {
        try {
            await navigator.clipboard.writeText(markdown);
            setCopied(true);
        } catch {
            setCopied(false);
            alert("Unable to copy. Please copy from the preview.");
        }
    }

    const valid =
        draft.title.trim().length > 0 &&
        slug.length > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(draft.date) &&
        draft.body.trim().length > 0;

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [submitSuccess, setSubmitSuccess] = useState("");


    async function submitPoem() {
        if (!valid || submitting) return;

        const confirmed = window.confirm(
            `Publish "${draft.title}" to Nocturne?\n\n` +
            `This will commit ${slug}.md to the main branch.`
        );

        if (!confirmed) return;

        setSubmitting(true);
        setSubmitError("");
        setSubmitSuccess("");

        try {
            const response = await fetch("/api/poems", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: draft.title,
                    date: draft.date,
                    tags: draft.tags
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    excerpt: draft.excerpt,
                    featured: draft.featured,
                    body: draft.body,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error ?? "Submission failed.");
            }

            setSubmitSuccess(
                `Successfully committed ${result.path} to GitHub.`
            );
        } catch (error) {
            setSubmitError(
                error instanceof Error
                    ? error.message
                    : "Unable to submit poem."
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="admin-shell">
            <header className="admin-header">
                <div className="brand">
                    <span className="brand-symbol">✦</span>
                    <span>Nocturne</span>
                </div>
                <span className="admin-label">PRIVATE EDITOR</span>
            </header>

            <main className="admin-main">
                <div className="page-heading">
                    <div className="eyebrow">✦ YOUR WRITING SPACE</div>
                    <h1>
                        Create a <em>poem.</em>
                    </h1>
                    <p>
                        Compose, format, and prepare a new poem
                        for the Nocturne collection.
                    </p>
                </div>

                <div className="editor-card">
                    <div className="editor-toolbar">
                        <span>NEW POEM</span>

                        <div className="view-switch">
                            <button
                                type="button"
                                className={!preview ? "active" : ""}
                                onClick={() => setPreview(false)}
                            >
                                Editor
                            </button>
                            <button
                                type="button"
                                className={preview ? "active" : ""}
                                onClick={() => setPreview(true)}
                            >
                                Markdown
                            </button>
                        </div>
                    </div>

                    {!preview ? (
                        <form onSubmit={(event) => event.preventDefault()}>
                            <div className="field">
                                <label htmlFor="title">Poem title</label>
                                <input
                                    id="title"
                                    value={draft.title}
                                    onChange={(event) =>
                                        update("title", event.target.value)
                                    }
                                    placeholder="A title for your poem"
                                    maxLength={200}
                                    required
                                />
                            </div>

                            <div className="field">
                                <label>Generated filename</label>
                                <div className="filename">
                                    {slug || "untitled"}.md
                                </div>
                            </div>

                            <div className="field-row">
                                <div className="field">
                                    <label htmlFor="date">Poem date</label>
                                    <input
                                        id="date"
                                        type="date"
                                        value={draft.date}
                                        onChange={(event) =>
                                            update("date", event.target.value)
                                        }
                                        required
                                    />
                                </div>

                                <div className="field">
                                    <label htmlFor="tags">Tags</label>
                                    <input
                                        id="tags"
                                        value={draft.tags}
                                        onChange={(event) =>
                                            update("tags", event.target.value)
                                        }
                                        placeholder="love, life, introspection"
                                    />
                                </div>
                            </div>

                            <div className="field">
                                <label htmlFor="excerpt">Excerpt</label>
                                <textarea
                                    id="excerpt"
                                    className="excerpt-input"
                                    value={draft.excerpt}
                                    onChange={(event) =>
                                        update("excerpt", event.target.value)
                                    }
                                    placeholder="A short passage or description..."
                                    rows={3}
                                />
                                <span className="field-hint">
                  Used on poem cards and in social previews.
                </span>
                            </div>

                            <label className="checkbox-field">
                                <input
                                    type="checkbox"
                                    checked={draft.featured}
                                    onChange={(event) =>
                                        update("featured", event.target.checked)
                                    }
                                />
                                <span>
                  <strong>Featured poem</strong>
                  <small>
                    Eligible for random selection on the homepage.
                  </small>
                </span>
                            </label>

                            <div className="field">
                                <label htmlFor="body">Poem</label>
                                <textarea
                                    id="body"
                                    className="poem-input"
                                    value={draft.body}
                                    onChange={(event) =>
                                        update("body", event.target.value)
                                    }
                                    placeholder="Your words begin here..."
                                    rows={14}
                                    required
                                />
                            </div>
                        </form>
                    ) : (
                        <div className="markdown-preview">
                            <pre>{markdown}</pre>
                        </div>
                    )}


                    <div className="editor-footer">
                        <div className="submission-status" aria-live="polite">
                            {submitError && (
                                <p className="error-message">{submitError}</p>
                            )}

                            {submitSuccess && (
                                <p className="success-message">{submitSuccess}</p>
                            )}

                            {!submitError && !submitSuccess && (
                                <span className="footer-note">
        Submissions commit directly to GitHub.
      </span>
                            )}
                        </div>

                        <div className="footer-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={copyMarkdown}
                                disabled={!valid || submitting}
                            >
                                Copy Markdown
                            </button>

                            <button
                                type="button"
                                className="primary-button"
                                onClick={submitPoem}
                                disabled={!valid || submitting || !!submitSuccess}
                            >
                                {submitting ? "Publishing..." : "Publish Poem"}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}



