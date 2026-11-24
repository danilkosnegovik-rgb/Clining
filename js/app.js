(function () {
  'use strict';

  const STORAGE_KEYS = {
    media: 'ict_preview_media_v1',
    services: 'ict_preview_services_v1'
  };

  const ICONS = {
    factory: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 27V13l7 4v-4l7 4v-4l10 4v10H4z"/><path d="M8 27v-4h3v4M15 27v-4h3v4M22 27v-4h3v4"/><path d="M7 13V6h4v7"/></svg>`,
    floor: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="21" r="7"/><circle cx="16" cy="21" r="2.5"/><path d="M16 14V5l6 2"/></svg>`,
    window: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6" width="22" height="20" rx="1.5"/><path d="M16 6v20M5 16h22"/></svg>`,
    home: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l11-9 11 9"/><path d="M8 13v13h16V13"/><path d="M13 26v-7h6v7"/></svg>`,
    bed: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V12a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v10"/><path d="M4 17h24M4 22v4M28 22v4M8 14h6"/></svg>`,
    broom: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M24 5L14 15"/><path d="M10 15l7 7-7 5-5-5 5-7z"/><path d="M9 21l3 3M12 18l3 3"/></svg>`,
    helmet: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21a11 11 0 0 1 22 0"/><path d="M3 21h26v3H3z"/><path d="M16 10v6"/></svg>`,
    sofa: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15V10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="M4 15h24v8H4z"/><path d="M7 23v3M25 23v3"/></svg>`,
    flame: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4c4 5 8 8.5 8 14a8 8 0 1 1-16 0c0-3.3 1.7-6.3 4-9 0 2 1.2 3.5 2.5 4 0-3.5 1.5-6.5 1.5-9z"/><path d="M16 26a3.5 3.5 0 0 0 3.5-3.5c0-2-1.5-3.5-3.5-5-2 1.5-3.5 3-3.5 5A3.5 3.5 0 0 0 16 26z"/></svg>`,
    shield: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4l10 4v8c0 6-4.2 10-10 12-5.8-2-10-6-10-12V8l10-4z"/><path d="M12 16l3 3 5-6"/></svg>`,
    cloud: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 24h13a5.5 5.5 0 0 0 .8-10.94A7 7 0 0 0 9.6 11.4 5 5 0 0 0 9.5 24z"/></svg>`
  };

  let galleryItems = [];

  async function fetchJson(url) {
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    return res.json();
  }

  function loadLocalOverride(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function formatPrice(price, unit) {
    const cleanPrice = String(price || '').trim();
    const cleanUnit = String(unit || 'услуга').trim();
    if (!cleanPrice) return cleanUnit === 'договорная' ? 'Цена договорная' : 'по запросу';
    return `от ${cleanPrice} руб./${cleanUnit}`;
  }

  function applySiteConfig(cfg) {
    if (!cfg) return;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.textContent = val;
    };

    setText('heroCity', cfg.company?.city);
    setText('heroTagline', cfg.company?.tagline);
    setText('worksNote', cfg.works?.note);
    setText('legalInfo', cfg.company?.legalInfo);

    const c = cfg.contacts || {};
    setText('contactPhone1Text', c.phonePrimaryDisplay);
    setText('contactPhone2Text', c.phoneSecondaryDisplay);
    setText('contactMaxText', c.maxDisplay);
    setText('contactTgText', c.telegramHandle);
    setText('contactEmailText', c.emailDisplay);

    if (c.phonePrimaryHref) {
      document.querySelectorAll('.js-phone-cta').forEach((el) => el.setAttribute('href', c.phonePrimaryHref));
      document.getElementById('contactMax')?.setAttribute('href', c.phonePrimaryHref);
    }
    if (c.phoneSecondaryHref) {
      document.getElementById('contactPhone2')?.setAttribute('href', c.phoneSecondaryHref);
    }
    if (c.telegramHref) {
      document.querySelectorAll('.js-tg-cta').forEach((el) => el.setAttribute('href', c.telegramHref));
    }
    if (c.emailHref) {
      document.querySelectorAll('.js-email-cta').forEach((el) => el.setAttribute('href', c.emailHref));
    }

    if (Array.isArray(cfg.faq)) renderFaq(cfg.faq);
  }

  function renderMedia(media) {
    if (!media) return;

    const logoImg = document.getElementById('brandLogoImg');
    if (logoImg && media.logo?.src) {
      logoImg.src = media.logo.src;
      if (media.logo.alt) logoImg.alt = media.logo.alt;
    }

    const heroImg = document.getElementById('heroImage');
    if (heroImg && media.hero?.src) {
      heroImg.src = media.hero.src;
      if (media.hero.alt) heroImg.alt = media.hero.alt;
    }

    galleryItems = Array.isArray(media.gallery) ? media.gallery : [];
    renderFeaturedWork(galleryItems);
  }

  // Show ONLY the first video on the main page; rest is inside the Works Modal
  function renderFeaturedWork(items) {
    const wrap = document.getElementById('worksFeaturedWrap');
    if (!wrap) return;

    wrap.innerHTML = '';
    const firstVideo = items.find((i) => i.type === 'video') || items[0];
    if (!firstVideo) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'work-featured-card';
    btn.setAttribute('aria-label', 'Открыть галерею фото и видео наших работ');

    if (firstVideo.type === 'video') {
      const vid = document.createElement('video');
      vid.src = `${firstVideo.src}#t=0.5`;
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      btn.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = firstVideo.src;
      img.alt = firstVideo.title || 'Наши работы';
      btn.appendChild(img);
    }

    const overlay = document.createElement('div');
    overlay.className = 'work-tile-overlay';
    overlay.innerHTML = `<span class="work-tile-play" aria-hidden="true">▶</span>`;
    overlay.style.justifyContent = 'center';

    btn.appendChild(overlay);
    btn.addEventListener('click', openWorksModal);
    wrap.appendChild(btn);
  }

  function renderServices(payload) {
    const container = document.getElementById('servicesCategories');
    if (!container) return;

    const services = Array.isArray(payload.services) ? payload.services : [];
    const categories = Array.isArray(payload.categories) && payload.categories.length
      ? payload.categories
      : [
          { id: 'business', number: '01', title: 'Для бизнеса' },
          { id: 'home', number: '02', title: 'Для дома и квартир' },
          { id: 'special', number: '03', title: 'Специальные услуги' }
        ];

    container.innerHTML = '';

    categories.forEach((cat) => {
      const catServices = services.filter((s) => (s.category || 'business') === cat.id);
      if (catServices.length === 0) return;

      const block = document.createElement('div');
      block.className = 'service-category-block';

      const head = document.createElement('div');
      head.className = 'service-category-head';
      head.innerHTML = `<span class="service-cat-num"></span><h3 class="service-cat-title"></h3>`;
      head.querySelector('.service-cat-num').textContent = cat.number;
      head.querySelector('.service-cat-title').textContent = cat.title;

      const grid = document.createElement('div');
      grid.className = 'services-cards-grid';

      catServices.forEach((srv, idx) => {
        const card = document.createElement('article');
        card.className = 'service-card';

        const iconHtml = ICONS[srv.icon] || ICONS.factory;
        const numLabel = srv.number || String(idx + 1).padStart(2, '0');

        card.innerHTML = `
          <div class="service-card-top">
            <div>
              <div class="service-card-num"></div>
              <h4 class="service-card-title"></h4>
              <div class="service-card-price"></div>
            </div>
            <span class="service-card-icon" aria-hidden="true">${iconHtml}</span>
          </div>
          <button type="button" class="service-card-btn">Подробнее</button>
        `;

        card.querySelector('.service-card-num').textContent = numLabel;
        card.querySelector('.service-card-title').textContent = srv.title;
        card.querySelector('.service-card-price').textContent = srv.priceLabel || 'Цена договорная';

        card.querySelector('.service-card-btn').addEventListener('click', () => openServiceModal(srv));
        grid.appendChild(card);
      });

      block.appendChild(head);
      block.appendChild(grid);
      container.appendChild(block);
    });
  }

  function renderFaq(items) {
    const container = document.getElementById('faqList');
    if (!container) return;

    container.innerHTML = '';
    items.forEach((item, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'faq-item';

      const panelId = `faq-panel-${idx}`;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'faq-trigger';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);

      const qSpan = document.createElement('span');
      qSpan.textContent = item.question;

      const chev = document.createElement('span');
      chev.className = 'faq-chevron';
      chev.setAttribute('aria-hidden', 'true');
      chev.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

      trigger.appendChild(qSpan);
      trigger.appendChild(chev);

      const panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'faq-panel';
      panel.hidden = true;
      panel.textContent = item.answer;

      trigger.addEventListener('click', () => {
        const isOpen = wrap.classList.toggle('is-open');
        trigger.setAttribute('aria-expanded', String(isOpen));
        panel.hidden = !isOpen;
      });

      wrap.appendChild(trigger);
      wrap.appendChild(panel);
      container.appendChild(wrap);
    });
  }

  // MODAL 1: Service Details
  const serviceModal = document.getElementById('serviceModal');
  const serviceModalTitle = document.getElementById('serviceModalTitle');
  const serviceModalPrice = document.getElementById('serviceModalPrice');
  const serviceModalIcon = document.getElementById('serviceModalIcon');
  const serviceModalIncluded = document.getElementById('serviceModalIncluded');
  const serviceModalExcluded = document.getElementById('serviceModalExcluded');
  const serviceModalExtras = document.getElementById('serviceModalExtras');
  const serviceModalClose = document.getElementById('serviceModalClose');

  function openServiceModal(service) {
    if (!serviceModal || !service) return;

    serviceModalTitle.textContent = service.title || '';
    serviceModalPrice.textContent = service.priceLabel || '';
    serviceModalIcon.innerHTML = ICONS[service.icon] || ICONS.factory;

    serviceModalIncluded.innerHTML = '';
    (service.included || []).forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      serviceModalIncluded.appendChild(li);
    });

    serviceModalExcluded.innerHTML = '';
    (service.excluded || []).forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      serviceModalExcluded.appendChild(li);
    });

    serviceModalExtras.innerHTML = '';
    const extras = Array.isArray(service.extras) ? service.extras : [];
    if (extras.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'extra-row';
      emptyRow.innerHTML = '<span class="extra-name">Дополнительные работы согласовываются индивидуально</span><span class="extra-price">Цена договорная</span>';
      serviceModalExtras.appendChild(emptyRow);
    } else {
      extras.forEach((extra) => {
        const row = document.createElement('div');
        row.className = 'extra-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'extra-name';
        nameEl.textContent = extra.name;

        const priceEl = document.createElement('span');
        priceEl.className = 'extra-price';
        priceEl.textContent = formatPrice(extra.price, extra.unit);

        row.appendChild(nameEl);
        row.appendChild(priceEl);
        serviceModalExtras.appendChild(row);
      });
    }

    serviceModal.hidden = false;
    document.body.classList.add('no-scroll');
    serviceModalClose?.focus();
  }

  function closeServiceModal() {
    if (!serviceModal) return;
    serviceModal.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  serviceModalClose?.addEventListener('click', closeServiceModal);
  serviceModal?.addEventListener('click', (e) => {
    if (e.target === serviceModal) closeServiceModal();
  });

  // MODAL 2: Our Works Photo & Video Gallery
  const worksModal = document.getElementById('worksModal');
  const worksModalVideos = document.getElementById('worksModalVideos');
  const worksModalPhotos = document.getElementById('worksModalPhotos');
  const worksModalClose = document.getElementById('worksModalClose');
  const btnOpenWorksModal = document.getElementById('btnOpenWorksModal');

  function openWorksModal() {
    if (!worksModal) return;

    worksModalVideos.innerHTML = '';
    worksModalPhotos.innerHTML = '';

    const videos = galleryItems.filter((i) => i.type === 'video');
    const photos = galleryItems.filter((i) => i.type !== 'video');

    videos.forEach((v) => {
      const card = document.createElement('div');
      card.className = 'gallery-video-card';

      const videoEl = document.createElement('video');
      videoEl.src = v.src;
      if (v.poster) videoEl.poster = v.poster;
      videoEl.controls = true;
      videoEl.playsInline = true;
      videoEl.preload = 'metadata';

      const meta = document.createElement('div');
      meta.className = 'gallery-video-meta';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = v.title || 'Видео с объекта';
      const capSpan = document.createElement('span');
      capSpan.textContent = v.caption || '';
      meta.appendChild(titleSpan);
      meta.appendChild(capSpan);

      card.appendChild(videoEl);
      card.appendChild(meta);
      worksModalVideos.appendChild(card);
    });

    photos.forEach((p) => {
      const fig = document.createElement('figure');
      fig.className = 'gallery-photo-card';
      fig.tabIndex = 0;

      const img = document.createElement('img');
      img.src = p.src;
      img.alt = p.title || 'Фото выполненной работы';
      img.loading = 'lazy';

      const cap = document.createElement('figcaption');
      cap.textContent = p.caption ? `${p.title} — ${p.caption}` : (p.title || 'Выполненный объект');

      fig.appendChild(img);
      fig.appendChild(cap);

      const zoom = () => openLightbox(p.src, cap.textContent);
      fig.addEventListener('click', zoom);
      fig.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          zoom();
        }
      });

      worksModalPhotos.appendChild(fig);
    });

    worksModal.hidden = false;
    document.body.classList.add('no-scroll');
    worksModalClose?.focus();
  }

  function closeWorksModal() {
    if (!worksModal) return;
    worksModal.querySelectorAll('video').forEach((v) => v.pause());
    worksModal.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  btnOpenWorksModal?.addEventListener('click', openWorksModal);
  worksModalClose?.addEventListener('click', closeWorksModal);
  worksModal?.addEventListener('click', (e) => {
    if (e.target === worksModal) closeWorksModal();
  });

  // Lightbox Modal
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');

  function openLightbox(src, caption) {
    if (!lightboxModal || !src) return;
    lightboxImage.src = src;
    lightboxImage.alt = caption || '';
    lightboxCaption.textContent = caption || '';
    lightboxModal.hidden = false;
    lightboxClose?.focus();
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.hidden = true;
  }

  lightboxClose?.addEventListener('click', closeLightbox);
  lightboxModal?.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightboxModal && !lightboxModal.hidden) closeLightbox();
      else if (worksModal && !worksModal.hidden) closeWorksModal();
      else if (serviceModal && !serviceModal.hidden) closeServiceModal();
    }
  });

  // Auto-hide header on scroll down + scroll-to-top button
  const siteHeader = document.getElementById('siteHeader');
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  const burgerBtn = document.getElementById('burgerBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');

  let lastScrollY = window.scrollY || 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY || 0;
    const menuOpen = burgerBtn?.getAttribute('aria-expanded') === 'true';

    if (siteHeader) {
      if (y > 90 && y > lastScrollY + 4 && !menuOpen) {
        siteHeader.classList.add('is-hidden');
      } else if (y < lastScrollY - 4 || y <= 40) {
        siteHeader.classList.remove('is-hidden');
      }
    }

    if (scrollTopBtn) {
      scrollTopBtn.hidden = y < 420;
    }

    lastScrollY = y;
  }, { passive: true });

  scrollTopBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Mobile horizontal swipe carousels (Care + Guarantees)
  function bindSwipeDots(trackId, dotsSelector, itemSelector) {
    const track = document.getElementById(trackId);
    const dots = document.querySelectorAll(dotsSelector);
    if (!track || !dots.length) return;

    track.addEventListener('scroll', () => {
      const cards = track.querySelectorAll(itemSelector);
      if (!cards.length) return;
      const cardW = cards[0].offsetWidth + 12;
      const idx = Math.min(cards.length - 1, Math.max(0, Math.round(track.scrollLeft / cardW)));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
    }, { passive: true });

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = Number(dot.dataset.index || 0);
        const cards = track.querySelectorAll(itemSelector);
        if (cards[idx]) {
          track.scrollTo({ left: cards[idx].offsetLeft - track.offsetLeft, behavior: 'smooth' });
        }
      });
    });
  }

  bindSwipeDots('careTrack', '#careDots .care-dot', '.care-card');
  bindSwipeDots('guaranteesTrack', '#guaranteesDots .care-dot', '.guarantee-card');

  // Mobile Menu Burger
  burgerBtn?.addEventListener('click', () => {
    const expanded = burgerBtn.getAttribute('aria-expanded') === 'true';
    burgerBtn.setAttribute('aria-expanded', String(!expanded));
    if (mobileDrawer) mobileDrawer.hidden = expanded;
    siteHeader?.classList.remove('is-hidden');
  });

  document.querySelectorAll('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      burgerBtn?.setAttribute('aria-expanded', 'false');
      if (mobileDrawer) mobileDrawer.hidden = true;
    });
  });

  // Initialize data
  async function init() {
    try {
      const [config, media, services] = await Promise.all([
        fetchJson('data/site-config.json'),
        fetchJson('data/media.json'),
        fetchJson('data/services.json')
      ]);

      applySiteConfig(config);

      const localMedia = loadLocalOverride(STORAGE_KEYS.media);
      renderMedia(localMedia || media);

      const localServices = loadLocalOverride(STORAGE_KEYS.services);
      renderServices(localServices || services);
    } catch (err) {
      console.error('Error initializing ICT site data:', err);
    }
  }

  init();
})();
