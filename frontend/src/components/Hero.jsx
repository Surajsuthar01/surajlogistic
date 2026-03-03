const Hero = () => {
    return (
        <section
            className="section hero"
            aria-label="home"
            id="home"
            style={{
                backgroundImage: 'url("/assets/images/hero-banner.jpg")',
            }}
        >
            <div className="container">
                <div className="hero-content">
                    <h2 className="h1 hero-title">
                        <span className="span">To Every</span> Direction
                    </h2>

                    <p className="hero-text">
                        We serve the best logistics services to our customers. We are the best
                        in the industry.
                    </p>

                    <a href="#" className="btn-outline">
                        View Services
                    </a>

                    <img
                        src="/assets/images/hero-shape.png"
                        width="116"
                        height="116"
                        loading="lazy"
                        className="hero-shape shape-1"
                        alt=""
                    />

                    <img
                        src="/assets/images/hero-shape.png"
                        width="116"
                        height="116"
                        loading="lazy"
                        className="hero-shape shape-2"
                        alt=""
                    />
                </div>
            </div>
        </section>
    );
};

export default Hero;
