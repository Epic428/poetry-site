import {Link} from "react-router-dom";
import {ArrowUpRight} from "lucide-react";
import type {Poem} from "../lib/poems";

export default function PoemCard({poem}: Readonly<{ poem: Poem }>) {
    return <Link className="poem-card" to={`/poems/${poem.slug}`}>
        <div className="card-meta">{poem.date} · {poem.tags.join(" / ")}</div>
        <h3>{poem.title}</h3><p>{poem.excerpt}</p>
        <div className="card-bottom">Read poem <ArrowUpRight size={17}/></div>
    </Link>
}