const Newsletter = () => {
    return (
        <section className="section newsletter" aria-label="newsletter">
            <div className="container">
                <figure className="newsletter-banner img-holder">
                    <img
                        src="/assets/images/newsletter-banner.png"
                        width="303"
                        height="381"
                        alt="newsletter banner"
                        className="w-100"
                    />
                </figure>

                <div className="newsletter-content">
                    <h2 className="h2 section-title">Subscribe for offers and news</h2>

                    <form action="" className="newsletter-form">
                        <input
                            type="email"
                            name="email_address"
                            placeholder="Enter Your Email"
                            aria-label="email"
                            className="email-field"
                        />
                        <button type="submit" className="newsletter-btn">
                            Subscribe Now
                        </button>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Newsletter;
