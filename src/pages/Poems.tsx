import {useState} from "react";
import {poems} from "../lib/poems";
import PoemCard from "../components/PoemCard";

export default function Poems() {
    const [q, setQ] = useState("");
    const [tag, setTag] = useState("All");
    const tags = ["All", ...new Set(poems.flatMap(p => p.tags))];
    const visible = poems.filter(p => (tag === "All" || p.tags.includes(tag)) && [p.title, p.excerpt, p.body].join(" ").toLowerCase().includes(q.toLowerCase()));
    return <main className="container inner-page">
        <div className="kicker">✦ THE COLLECTION</div>
        <h1>Poems<span className="period">.</span></h1><p>A collection of thoughts, moments, and quiet reflections.</p>
        <div className="filters"><label className="search-box"><span className="sr-only">Search poems</span><input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Search poems..."/></label>
            <div className="tag-filters">{tags.map(t => <button key={t} className={`tag ${tag === t ? "active" : ""}`}
                                                                onClick={() => setTag(t)}
                                                                aria-pressed={tag === t}>{t}</button>)}</div>
        </div>
        <p className="results-count">{visible.length} POEMS FOUND</p>
        <div className="poem-grid">{visible.map(p => <PoemCard key={p.slug} poem={p}/>)}</div>
        {!visible.length && <p>No poems found.</p>}</main>
}