/*
 * Website interactions | November 2026 | Eli Bulger
 * Steps: Restore theme; handle navigation; filter content; reveal sections; enable CV printing.
 * Inputs: User button clicks and saved theme preference.
 * Outputs: Accessible visual states; no external network requests.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const themeButton = document.querySelector('.theme-toggle');
  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.nav-links');

  try {
    const savedTheme = localStorage.getItem('eli-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;
  } catch (_) { /* Theme preference is optional when storage is disabled. */ }

  if (themeButton) {
    const updateLabel = () => {
      themeButton.setAttribute('aria-label', `Switch to ${root.dataset.theme === 'light' ? 'dark' : 'light'} theme`);
    };
    updateLabel();
    themeButton.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('eli-theme', root.dataset.theme); } catch (_) { /* Optional. */ }
      updateLabel();
    });
  }

  if (menuButton && menu) {
    const closeMenu = () => {
      menu.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
    };
    menuButton.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    });
  }

  document.querySelectorAll('[data-filter-group]').forEach((group) => {
    const filterTarget = document.querySelector(`[data-filter-target="${group.dataset.filterGroup}"]`);
    if (!filterTarget) return;
    const cards = [...filterTarget.querySelectorAll('[data-category]')];
    group.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const category = button.dataset.filter;
        group.querySelectorAll('[data-filter]').forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        cards.forEach((card) => { card.hidden = category !== 'all' && !card.dataset.category.split(' ').includes(category); });
      });
    });
  });

  const printButton = document.querySelector('#print-cv');
  if (printButton) printButton.addEventListener('click', () => window.print());

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduceMotion) {
    root.classList.add('js-motion');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.07, rootMargin: '0px 0px 45px 0px' });
    document.querySelectorAll('.reveal').forEach((item) => observer.observe(item));
  }
})();
