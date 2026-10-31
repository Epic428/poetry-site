import {Routes, Route} from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Poems from "./pages/Poems";
import PoemDetail from "./pages/PoemDetail";
import About from "./pages/About";

export default function App() {
    return <Layout><Routes><Route path="/" element={<Home/>}/><Route path="/poems" element={<Poems/>}/><Route
        path="/poems/:slug" element={<PoemDetail/>}/><Route path="/about" element={<About/>}/><Route path="*"
                                                                                                     element={<main
                                                                                                         className="container inner-page">
                                                                                                         <h1>Page not
                                                                                                             found</h1>
                                                                                                     </main>}/></Routes></Layout>
}