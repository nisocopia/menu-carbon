const nav = document.querySelector('.menu-nav');

const leftArrow = document.querySelector('.left');
const rightArrow = document.querySelector('.right');

function updateArrows() {

    const maxScroll =
        nav.scrollWidth - nav.clientWidth;

    if (nav.scrollLeft <= 5) {
        leftArrow.style.opacity = '0';
    } else {
        leftArrow.style.opacity = '1';
    }

    if (nav.scrollLeft >= maxScroll - 5) {
        rightArrow.style.opacity = '0';
    } else {
        rightArrow.style.opacity = '1';
    }
}

nav.addEventListener('scroll', updateArrows);

window.addEventListener('load', updateArrows);