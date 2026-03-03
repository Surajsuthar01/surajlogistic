import Header from './components/Header'
import Hero from './components/Hero'
import About from './components/About'
import Services from './components/Services'
import Feature from './components/Feature'
import Projects from './components/Projects'
import Testimonials from './components/Testimonials'
import Blog from './components/Blog'
import Newsletter from './components/Newsletter'
import Footer from './components/Footer'

function App() {
    return (
        <>
            <Header />
            <main>
                <article>
                    <Hero />
                    <About />
                    <Services />
                    <Feature />
                    <Projects />
                    <Testimonials />
                    <Blog />
                    <Newsletter />
                </article>
            </main>
            <Footer />
            <a href="#top" className="back-top-btn active" aria-label="Back to top">
                <ion-icon name="chevron-up"></ion-icon>
            </a>
        </>
    )
}

export default App
