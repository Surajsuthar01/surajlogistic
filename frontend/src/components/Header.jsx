import { useState, useEffect } from 'react';

const Header = () => {
    const [isNavActive, setIsNavActive] = useState(false);
    const [isHeaderActive, setIsHeaderActive] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY >= 100) {
                setIsHeaderActive(true);
            } else {
                setIsHeaderActive(false);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const toggleNav = () => {
        setIsNavActive(!isNavActive);
    };

    const closeNav = () => {
        setIsNavActive(false);
    };

    return (
        <header className={`header ${isHeaderActive ? 'active' : ''}`} data-header>
            <div className="container">
                <h1>
                    <a href="#" className="logo">
                        Surajlogistic
                    </a>
                </h1>

                <nav className={`navbar ${isNavActive ? 'active' : ''}`} data-navbar>
                    <div className="navbar-top">
                        <a href="#" className="logo">
                            <img
                                src="/favicon.svg"
                                alt="Surajlogistic Logo"
                                width="30"
                                height="30"
                                style={{
                                    display: 'inline-block',
                                    verticalAlign: 'middle',
                                    marginRight: '8px',
                                }}
                            />
                            Surajlogistic
                        </a>

                        <button
                            className="nav-close-btn"
                            aria-label="Close menu"
                            onClick={toggleNav}
                        >
                            <ion-icon name="close-outline"></ion-icon>
                        </button>
                    </div>

                    <ul className="navbar-list">
                        <li className="navbar-item">
                            <a href="#home" className="navbar-link" onClick={closeNav}>
                                <span>Home</span>
                                <ion-icon name="chevron-forward"></ion-icon>
                            </a>
                        </li>

                        <li className="navbar-item">
                            <a href="#about" className="navbar-link" onClick={closeNav}>
                                <span>About</span>
                                <ion-icon name="chevron-forward"></ion-icon>
                            </a>
                        </li>

                        <li className="navbar-item">
                            <a href="#service" className="navbar-link" onClick={closeNav}>
                                <span>Service</span>
                                <ion-icon name="chevron-forward"></ion-icon>
                            </a>
                        </li>

                        <li className="navbar-item">
                            <a href="#blog" className="navbar-link" onClick={closeNav}>
                                <span>Blog</span>
                                <ion-icon name="chevron-forward"></ion-icon>
                            </a>
                        </li>

                        <li className="navbar-item">
                            <a href="#" className="navbar-link" onClick={closeNav}>
                                <span>Contact</span>
                                <ion-icon name="chevron-forward"></ion-icon>
                            </a>
                        </li>
                    </ul>
                </nav>

                <div className="header-contact">
                    <div>
                        <p className="contact-label">contact</p>
                        <a href="tel:6350692701" className="contact-number">63506-92701</a>
                    </div>
                    <div className="contact-icon">
                        <ion-icon name="call-outline"></ion-icon>
                    </div>
                </div>

                <button className="nav-open-btn" aria-label="Open menu" onClick={toggleNav}>
                    <ion-icon name="menu-outline"></ion-icon>
                </button>

                <div
                    className={`overlay ${isNavActive ? 'active' : ''}`}
                    onClick={toggleNav}
                    data-overlay
                ></div>
            </div>
        </header>
    );
};

export default Header;
