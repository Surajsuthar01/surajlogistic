const Footer = () => {
    return (
        <footer className="footer">
            <div className="container">
                <div className="footer-top section">
                    <div className="footer-brand">
                        <a href="#" className="logo">Surajlogistic</a>

                        <p className="footer-text">
                            Surajlogistic provides first two Shipments for free. Enjoy the
                            best logistics services with us.
                        </p>

                        <ul className="social-list" style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
                            <li>
                                <a
                                    href="https://www.linkedin.com/in/suraj-suthar-7a088a28b/"
                                    className="social-link"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-linkedin"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></svg>
                                </a>
                            </li>
                            <li>
                                <a href="#" className="social-link">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-twitter"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" /></svg>
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://www.instagram.com/surajsuthar01/"
                                    className="social-link"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-instagram"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>
                                </a>
                            </li>
                        </ul>
                    </div>

                    <ul className="footer-list">
                        <li>
                            <p className="footer-list-title">Quick Links</p>
                        </li>
                        <li>
                            <a href="#" className="footer-link">About</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Services</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Blog</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">FAQ</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Contact Us</a>
                        </li>
                    </ul>

                    <ul className="footer-list">
                        <li>
                            <p className="footer-list-title">Services</p>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Warehouse</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Air Freight</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Ocean Freight</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Road Freight</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Packaging</a>
                        </li>
                    </ul>

                    <ul className="footer-list">
                        <li>
                            <p className="footer-list-title">Community</p>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Business Consulting</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Testimonials</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Track Your Shipment</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Privacy Policy</a>
                        </li>
                        <li>
                            <a href="#" className="footer-link">Terms & Condition</a>
                        </li>
                    </ul>
                </div>

                <div className="footer-bottom">
                    <p className="copyright" style={{ textAlign: 'center' }}>
                        &copy; {new Date().getFullYear()} Surajlogistic. All Rights Reserved by{' '}
                        <a
                            href="https://devsuraj.online"
                            className="copyright-link"
                            target="_blank"
                            rel="noreferrer"
                        >
                            devsuraj.online
                        </a>
                    </p>
                </div>
            </div>
        </footer >
    );
};

export default Footer;
