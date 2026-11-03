/**
 * GalleryWeb - script pubblico: menu mobile + lightbox galleria
 */
(function () {
    'use strict';

    // --- Menu mobile ---
    var toggle = document.getElementById('menuToggle');
    var nav = document.getElementById('siteNav');
    if (toggle && nav) {
        toggle.addEventListener('click', function () {
            var isOpen = nav.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    // --- Lightbox ---
    var lightbox = document.getElementById('lightbox');
    if (!lightbox) return;

    var imgEl = document.getElementById('lightboxImg');
    var captionEl = document.getElementById('lightboxCaption');
    var closeBtn = document.getElementById('lightboxClose');
    var prevBtn = document.getElementById('lightboxPrev');
    var nextBtn = document.getElementById('lightboxNext');

    var currentGroup = [];
    var currentIndex = 0;

    function openLightbox(group, index) {
        currentGroup = group;
        currentIndex = index;
        renderCurrent();
        lightbox.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    function renderCurrent() {
        var link = currentGroup[currentIndex];
        imgEl.src = link.getAttribute('href');
        captionEl.textContent = link.getAttribute('data-caption') || '';
    }

    function closeLightbox() {
        lightbox.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
        var links = Array.prototype.slice.call(gallery.querySelectorAll('a[href]'));
        links.forEach(function (link, index) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                openLightbox(links, index);
            });
        });
    });

    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
        if (e.target === lightbox) closeLightbox();
    });
    prevBtn.addEventListener('click', function () {
        currentIndex = (currentIndex - 1 + currentGroup.length) % currentGroup.length;
        renderCurrent();
    });
    nextBtn.addEventListener('click', function () {
        currentIndex = (currentIndex + 1) % currentGroup.length;
        renderCurrent();
    });
    document.addEventListener('keydown', function (e) {
        if (!lightbox.classList.contains('is-open')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') prevBtn.click();
        if (e.key === 'ArrowRight') nextBtn.click();
    });
})();
