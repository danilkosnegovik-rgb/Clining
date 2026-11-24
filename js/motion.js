/* ==========================================================================
   ICT Motion & Micro-Interactions Script
   Lightweight, dependency-free, 60 FPS scroll & pointer interactions
   ========================================================================== */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  var isFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  /* 1. Top Scroll Progress Line */
  function initScrollProgress() {
    var bar = document.createElement('div');
    bar.className = 'scroll-progress-bar';
    bar.setAttribute('aria-hidden', 'true');

    var fill = document.createElement('div');
    fill.className = 'scroll-progress-fill';
    bar.appendChild(fill);
    document.body.appendChild(bar);

    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var maxScroll = doc.scrollHeight - window.innerHeight;
      var progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      fill.style.transform = 'scaleX(' + progress.toFixed(4) + ')';
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* 2. Tactile Click Ripple on Buttons */
  function initButtonRipples() {
    document.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('.btn, .service-card-btn');
      if (!btn || btn.disabled) return;

      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 0.9;
      var ripple = document.createElement('span');
      ripple.className = 'btn-ripple';
      ripple.style.width = size + 'px';
      ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left) + 'px';
      ripple.style.top = (e.clientY - rect.top) + 'px';

      btn.appendChild(ripple);
      ripple.addEventListener('animationend', function () {
        ripple.remove();
      });
    });
  }

  /* 3. Subtle Magnetic Pull on Main CTA Buttons (Desktop Only) */
  function initMagneticButtons() {
    if (!isFinePointer) return;

    var selectors = '.hero-actions .btn, #btnOpenWorksModal';
    var buttons = document.querySelectorAll(selectors);
    var strength = 5;

    buttons.forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var rect = btn.getBoundingClientRect();
        var relX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        var relY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        btn.style.transform = 'translate(' + (relX * strength).toFixed(2) + 'px, ' + (relY * strength).toFixed(2) + 'px)';
      });

      btn.addEventListener('pointerleave', function () {
        btn.style.transform = '';
      });
    });
  }

  /* 4. Warm Spotlight on Dark Cards (#guarantees & Footer Contacts) */
  function initSpotlightCards() {
    if (!isFinePointer) return;

    var cards = document.querySelectorAll('.guarantee-card, .contact-pill');
    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
        card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
      });
    });
  }

  /* 5. Living Scroll Timeline in #how ("Как договориться") */
  function initStepsTimeline() {
    var list = document.querySelector('#how .steps-list');
    if (!list) return;

    list.classList.add('has-motion-timeline');
    var fill = document.createElement('div');
    fill.className = 'steps-timeline-fill';
    fill.setAttribute('aria-hidden', 'true');
    list.appendChild(fill);

    var rows = Array.prototype.slice.call(list.querySelectorAll('.step-row'));
    var ticking = false;

    function updateTimeline() {
      var rect = list.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      var start = vh * 0.78;
      var end = vh * 0.28;
      var total = rect.height + (start - end);
      var current = start - rect.top;
      var progress = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;

      list.style.setProperty('--steps-progress', progress.toFixed(4));

      var count = rows.length;
      rows.forEach(function (row, idx) {
        var threshold = count > 1 ? idx / count : 0.1;
        if (progress >= threshold + 0.05) {
          row.classList.add('is-step-active');
        } else {
          row.classList.remove('is-step-active');
        }
      });

      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(updateTimeline);
        ticking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', updateTimeline, { passive: true });
    updateTimeline();
  }

  /* 6. Staggered Scroll Reveal (including dynamically rendered cards) */
  function initScrollReveals() {
    if (!('IntersectionObserver' in window)) return;

    document.documentElement.classList.add('motion-ready');

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    function registerTargets(root) {
      var groups = [
        '.section-eyebrow',
        '.section-title',
        '.section-lead',
        '.section-side-note',
        '.section-sub-note',
        '.min-order-card',
        '.care-card',
        '.work-featured-card',
        '.contract-card',
        '.contract-callout',
        '.guarantee-card',
        '.contact-pill',
        '.service-card',
        '.faq-item'
      ];

      groups.forEach(function (selector) {
        var nodes = root.querySelectorAll(selector);
        nodes.forEach(function (el, idx) {
          if (el.hasAttribute('data-reveal')) return;
          el.setAttribute('data-reveal', '');
          var stagger = (idx % 4) * 70;
          el.style.setProperty('--reveal-delay', stagger + 'ms');
          observer.observe(el);
        });
      });
    }

    registerTargets(document);

    // Watch dynamic containers rendered by js/app.js
    var dynamicIds = ['servicesCategories', 'worksFeaturedWrap', 'faqList'];
    dynamicIds.forEach(function (id) {
      var container = document.getElementById(id);
      if (!container) return;

      var mo = new MutationObserver(function () {
        registerTargets(container);
      });
      mo.observe(container, { childList: true, subtree: true });
    });
  }

  function init() {
    initScrollProgress();
    initButtonRipples();
    initMagneticButtons();
    initSpotlightCards();
    initStepsTimeline();
    initScrollReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
