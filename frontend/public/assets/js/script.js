"use strict";

/**
 * navbar toggle
 */

const navbar = document.querySelector("[data-navbar]");
const navToggler = document.querySelectorAll("[data-nav-toggler]");
const navLinks = document.querySelectorAll("[data-nav-link]");
const overlay = document.querySelector("[data-overlay]");

for (let i = 0; i < navToggler.length; i++) {
  navToggler[i].addEventListener("click", function () {
    navbar.classList.toggle("active");
    overlay.classList.toggle("active");
  });
}

for (let i = 0; i < navLinks.length; i++) {
  navLinks[i].addEventListener("click", function () {
    navbar.classList.remove("active");
    overlay.classList.remove("active");
  });
}

/**
 * header
 */

const header = document.querySelector("[data-header]");
const backTopBtn = document.querySelector("[data-back-top-btn]");

window.addEventListener("scroll", function () {
  if (window.scrollY >= 100) {
    header.classList.add("active");
    backTopBtn.classList.add("active");
  } else {
    header.classList.remove("active");
    backTopBtn.classList.remove("active");
  }
});

/**
 * Dynamic footer year and Redirect Links
 */

// Redirect all links to devsuraj.online
const allLinks = document.querySelectorAll(
  "a:not(.nav-close-btn):not(.nav-open-btn):not(.action-btn):not(.back-top-btn)",
);
allLinks.forEach((link) => {
  // Prevent default behavior if it's an anchor link and redirect
  link.addEventListener("click", function (e) {
    if (!link.hasAttribute("data-nav-link")) {
      e.preventDefault();
      window.location.href = "https://devsuraj.online";
    }
  });
});
