const Projects = () => {
    const projects = [
        { img: '/assets/images/project-1.jpg', tag: 'Warehousing , Distrbution', title: 'Warehouse inventory' },
        { img: '/assets/images/project-2.jpg', tag: 'Logistics, Analytics', title: 'Minimize Manufacturing' },
        { img: '/assets/images/project-3.jpg', tag: 'Warehousing , Distrbution', title: 'Warehouse inventory' },
        { img: '/assets/images/project-4.jpg', tag: 'Logistics, Analytics', title: 'Minimize Manufacturing' },
        { img: '/assets/images/project-5.jpg', tag: 'Warehousing , Distrbution', title: 'Warehouse inventory' },
        { img: '/assets/images/project-6.jpg', tag: 'Logistics, Analytics', title: 'Minimize Manufacturing' },
    ];

    return (
        <section className="section project" aria-label="project">
            <div className="container">
                <p className="section-subtitle">Projects</p>
                <h2 className="h2 section-title">Featured Projects</h2>
                <p className="section-text">
                    we are already working with hyundai,toyota,Tata and many more
                    companies. we are the best in the industry.
                </p>

                <ul className="project-list">
                    {projects.map((project, index) => (
                        <li className="project-item" key={index}>
                            <div className="project-card">
                                <figure
                                    className="card-banner img-holder"
                                    style={{ '--width': 397, '--height': 352 }}
                                >
                                    <img
                                        src={project.img}
                                        width="397"
                                        height="352"
                                        loading="lazy"
                                        alt={project.title}
                                        className="img-cover"
                                    />
                                </figure>

                                <button className="action-btn" aria-label="View image">
                                    <ion-icon name="expand-outline"></ion-icon>
                                </button>

                                <div className="card-content">
                                    <p className="card-tag">{project.tag}</p>
                                    <h3 className="h3">
                                        <a href="#" className="card-title">{project.title}</a>
                                    </h3>
                                    <a href="#" className="card-link">Read More</a>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
};

export default Projects;
