const Testimonials = () => {
    return (
        <section
            className="section testimonial"
            aria-label="testimonial"
            id="testimonial"
        >
            <div className="container">
                <p className="section-subtitle">Testimonials</p>
                <h2 className="h2 section-title">What Our Clients Say</h2>
                <p className="section-text">
                    Discover how we have helped businesses optimize their supply chain
                    and improve efficiency.
                </p>

                <ul className="testimonial-list grid-list">
                    <li>
                        <div className="testimonial-card">
                            <div className="card-icon">
                                <ion-icon name="chatbubbles-outline" aria-hidden="true"></ion-icon>
                            </div>
                            <h3 className="h3 card-title">John Doe</h3>
                            <p className="card-subtitle">CEO, TechStore</p>
                            <p className="card-text">
                                "Surajlogistic has completely changed the way we handle our
                                distribution. Their fast and reliable service ensures our
                                products always arrive on time."
                            </p>
                        </div>
                    </li>

                    <li>
                        <div className="testimonial-card">
                            <div className="card-icon">
                                <ion-icon name="chatbubbles-outline" aria-hidden="true"></ion-icon>
                            </div>
                            <h3 className="h3 card-title">Sarah Smith</h3>
                            <p className="card-subtitle">Logistics Manager, Hyundai</p>
                            <p className="card-text">
                                "We have been using their freight services for years and
                                they never disappoint. The tracking system is incredibly
                                easy to use and provides peace of mind."
                            </p>
                        </div>
                    </li>
                </ul>
            </div>
        </section>
    );
};

export default Testimonials;
