import {Link, useParams} from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {useState} from "react";
import {Copy, Mail, Share2} from "lucide-react";
import {findPoem} from "../lib/poems";

export default function PoemDetail() {
    const {slug = ""} = useParams();
    const poem = findPoem(slug);
    const [copied, setCopied] = useState(false);
    const poemUrl = `https://nocturnepoetry.com/poems/${encodeURIComponent(slug)}/`;
    const shareData = {title: poem?.title ?? "Nocturne", text: `Read ${poem?.title ?? "this poem"} on Nocturne`, url: poemUrl};
    async function copyLink() {
        try {
            await navigator.clipboard.writeText(poemUrl);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    }
    async function sharePoem() {
        if (!navigator.share) return;
        try {
            await navigator.share(shareData);
        } catch {
            // Dismissing the native share sheet is not an error for the reader.
        }
    }
    if (!poem) return <main className="container inner-page"><h1>Poem not found</h1><Link to="/poems">Back to
        poems</Link></main>;
    return <main className="container poem-detail"><Link to="/poems" className="back-link">← All poems</Link>
        <div className="kicker">✦ {poem.tags.join(" / ")}</div>
        <h1>{poem.title}<span className="period">.</span></h1>
        <div className="poem-date">{poem.date}</div>
        <article className="poem-body"><ReactMarkdown>{poem.body}</ReactMarkdown></article>
        <div className="poem-end">✦</div>
        <section className="poem-sharing" aria-label="Share this poem">
            <h2>Share this poem</h2>
            <div className="poem-share-actions">
                <button type="button" onClick={copyLink}><Copy size={16}/>{copied ? "Link copied" : "Copy link"}</button>
                {typeof navigator !== "undefined" && typeof navigator.share === "function" && <button type="button" onClick={sharePoem}><Share2 size={16}/>Share</button>}
                <a href={`mailto:?subject=${encodeURIComponent(poem.title + " | Nocturne")}&body=${encodeURIComponent(`I thought you might enjoy this poem:\n\n${poem.title}\n${poemUrl}`)}`}><Mail size={16}/>Email</a>
            </div>
        </section>
        <Link to="/poems">← Back to archive</Link></main>
}