import {Link} from "react-router-dom";

export default function About() {
    return <main className="container inner-page about-page">
        <div className="kicker">✦ THE PERSON BEHIND THE WORDS</div>
        <h1>A little <em>about me.</em></h1>
        <div className="about-divider"/>
        <p className="about-copy about-first">Hello, and welcome to this quiet corner of the internet.</p><p
        className="about-copy">Nocturne is a personal home for poems about memory, wonder, change, and the small moments
        that linger.</p><p className="about-copy">I am a parent first, programmer, writer, and gamer second. I write about how I feel and what I think about. Reading these poems is like looking through a window to my mind, you get to see all of the chaos that ensues.</p><Link to="/poems">Read the poems →</Link></main>
}