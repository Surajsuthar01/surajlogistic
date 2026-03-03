const Services = () => {
    const services = [
        { num: '01', title: 'Air Freight', img: '/assets/images/service-icon-1.png', alt: 'Truck' },
        { num: '02', title: 'Road Freight', img: '/assets/images/service-icon-2.png', alt: 'Ship' },
        { num: '03', title: 'Ocean Freight', img: '/assets/images/service-icon-3.png', alt: 'Airplane' },
        { num: '04', title: 'Rail Freight', img: '/assets/images/service-icon-4.png', alt: 'Train' },
        { num: '05', title: 'Warehousing', img: '/assets/images/service-icon-5.png', alt: 'Trolley' },
        { num: '06', title: 'Project Cargo', img: '/assets/images/service-icon-6.png', alt: 'Paper' },
    ];

    return (
        <section className="section service" id="service" aria-label="service">
            <div className="container">
                <p className="section-subtitle">All Services</p>
                <h2 className="h2 section-title">Trusted For Our Services</h2>
                <p className="section-text">
                    we have large number of services and solutions for you. we have a
                    wide range of solutions for you.
                </p>

                <ul className="service-list grid-list">
                    {services.map((service, index) => (
                        <li key={index}>
                            <div className="service-card">
                                <div className="card-icon">
                                    <img
                                        src={service.img}
                                        width={service.alt === 'Truck' ? 80 : service.alt === 'Ship' ? 74 : service.alt === 'Airplane' ? 60 : service.alt === 'Train' ? 50 : service.alt === 'Trolley' ? 63 : 46}
                                        height="60"
                                        loading="lazy"
                                        alt={service.alt}
                                    />
                                </div>

                                <h3 className="h3 card-title">
                                    <span className="span">{service.num}</span> {service.title}
                                </h3>

                                <p className="card-text">
                                    Our aim is to optimize and improve your supply chain so that
                                    we can give you the best service.
                                </p>

                                <a href="#" className="btn-link">
                                    <ion-icon name="chevron-forward" aria-hidden="true"></ion-icon>
                                    <span className="span">View Detail</span>
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
};
export default Services;
