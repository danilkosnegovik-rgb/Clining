(function () {
  'use strict';

  const STORAGE_KEYS = {
    media: 'ict_preview_media_v1',
    services: 'ict_preview_services_v1'
  };

  const ICONS = {
    factory: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 27V13l7 4v-4l7 4v-4l10 4v10H4z"/><path d="M8 27v-4h3v4M15 27v-4h3v4M22 27v-4h3v4"/><path d="M7 13V6h4v7M14 9c0-2 2-3 4-3"/></svg>`,
    bricks: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="24" height="18" rx="1.5"/><path d="M4 13h24M4 19h24M12 7v6M20 7v6M16 13v6M12 19v6M20 19v6"/></svg>`,
    broom: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M24 5L14 15"/><path d="M10 15l7 7-7 5-5-5 5-7z"/><path d="M9 21l3 3M12 18l3 3"/></svg>`,
    flask: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5h8M14 5v7l-7 12a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3l-7-12V5"/><path d="M9.5 20h13"/></svg>`,
    window: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6" width="22" height="20" rx="1.5"/><path d="M16 6v20M5 16h22"/></svg>`,
    flame: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4c4 5 8 8.5 8 14a8 8 0 1 1-16 0c0-3.3 1.7-6.3 4-9 0 2 1.2 3.5 2.5 4 0-3.5 1.5-6.5 1.5-9z"/><path d="M16 26a3.5 3.5 0 0 0 3.5-3.5c0-2-1.5-3.5-3.5-5-2 1.5-3.5 3-3.5 5A3.5 3.5 0 0 0 16 26z"/></svg>`,
    spray: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 11h8l2 5v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 9 26V16l2-5z"/><path d="M13 11V7h5v4M18 8h4M23 6l2-1M24 9h2M23 12l2 1"/></svg>`,
    cloud: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 24h13a5.5 5.5 0 0 0 .8-10.94A7 7 0 0 0 9.6 11.4 5 5 0 0 0 9.5 24z"/></svg>`
  };

  let servicesData = [];

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
    if (!cleanPrice) return 'по запросу';
    return `от ${cleanPrice} руб./${cleanUnit}`;
  }

  function applySiteConfig(cfg) {
    if (!cfg) return;

    const guaranteesText = document.getElementById('guaranteesText');
    if (guaranteesText && cfg.guarantees?.text) {
      guaranteesText.textContent = cfg.guarantees.text;
    }

    const worksNote = document.getElementById('worksNote');
    if (worksNote && cfg.works?.note) {
      worksNote.textContent = cfg.works.note;
    }

    const legalInfo = document.getElementById('legalInfo');
    if (legalInfo && cfg.company?.legalInfo) {
      legalInfo.textContent = cfg.company.legalInfo;
    }

    const phoneText = document.getElementById('contactPhoneText');
    if (phoneText && cfg.contacts?.phoneDisplay) {
      phoneText.textContent = cfg.contacts.phoneDisplay;
    }

    const emailText = document.getElementById('contactEmailText');
    if (emailText && cfg.contacts?.emailDisplay) {
      emailText.textContent = cfg.contacts.emailDisplay;
    }

    if (cfg.contacts?.phoneHref) {
      document.querySelectorAll('.js-phone-cta').forEach((el) => {
        el.setAttribute('href', cfg.contacts.phoneHref);
      });
    }

    if (cfg.contacts?.emailHref) {
      document.querySelectorAll('.js-email-cta').forEach((el) => {
        el.setAttribute('href', cfg.contacts.emailHref);
      });
    }

    if (Array.isArray(cfg.faq)) {
      renderFaq(cfg.faq);
    }
  }

  function renderMedia(media) {
    if (!media) return;

    const heroImg = document.getElementById('heroImage');
    if (heroImg && media.hero?.src) {
      heroImg.src = media.hero.src;
      if (media.hero.alt) heroImg.alt = media.hero.alt;
    }

    const worksList = document.getElementById('worksList');
    if (!worksList || !Array.isArray(media.works)) return;

    worksList.innerHTML = '';
    media.works.forEach((pair) => {
      const row = document.createElement('div');
      row.className = 'work-pair';

      const beforeCard = createWorkCard(pair.before?.src, pair.before?.alt || `${pair.title || 'Работа'} — До`, 'До', 'before');
      const afterCard = createWorkCard(pair.after?.src, pair.after?.alt || `${pair.title || 'Работа'} — После`, 'После', 'after');

      row.appendChild(beforeCard);
      row.appendChild(afterCard);
      worksList.appendChild(row);
    });
  }

  function createWorkCard(src, alt, badgeText, variant) {
    const card = document.createElement('div');
    card.className = 'work-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Открыть фото: ${alt}`);

    const img = document.createElement('img');
    img.src = src || '';
    img.alt = alt;
    img.loading = 'lazy';

    const badge = document.createElement('span');
    badge.className = `work-badge work-badge-${variant}`;
    badge.textContent = badgeText;

    card.appendChild(img);
    card.appendChild(badge);

    const open = () => openLightbox(img.src, alt);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    return card;
  }

  function renderServices(services) {
    servicesData = Array.isArray(services) ? services : [];
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;

    grid.innerHTML = '';
    servicesData.forEach((service) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'service-item';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', `${service.title} — подробнее`);

      const iconHtml = ICONS[service.icon] || ICONS.factory;
      btn.innerHTML = `
        <span class="service-item-left">
          <span class="service-icon" aria-hidden="true">${iconHtml}</span>
          <span class="service-name"></span>
        </span>
        <span class="service-more">Подробнее <span aria-hidden="true">→</span></span>
      `;
      btn.querySelector('.service-name').textContent = service.title;
      btn.addEventListener('click', () => openServiceModal(service));
      grid.appendChild(btn);
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

  // Service Modal
  const serviceModal = document.getElementById('serviceModal');
  const serviceModalTitle = document.getElementById('serviceModalTitle');
  const serviceModalIcon = document.getElementById('serviceModalIcon');
  const serviceModalIncluded = document.getElementById('serviceModalIncluded');
  const serviceModalExcluded = document.getElementById('serviceModalExcluded');
  const serviceModalExtras = document.getElementById('serviceModalExtras');
  const serviceModalClose = document.getElementById('serviceModalClose');

  function openServiceModal(service) {
    if (!serviceModal || !service) return;

    serviceModalTitle.textContent = service.title || '';
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
      emptyRow.innerHTML = '<span class="extra-name">Дополнительные работы согласовываются индивидуально</span><span class="extra-price">по запросу</span>';
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
  document.querySelectorAll('.js-modal-close-on-click').forEach((el) => {
    el.addEventListener('click', closeServiceModal);
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
    document.body.classList.add('no-scroll');
    lightboxClose?.focus();
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  lightboxClose?.addEventListener('click', closeLightbox);
  lightboxModal?.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightboxModal && !lightboxModal.hidden) closeLightbox();
      else if (serviceModal && !serviceModal.hidden) closeServiceModal();
    }
  });

  // Mobile Menu Burger
  const burgerBtn = document.getElementById('burgerBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');

  burgerBtn?.addEventListener('click', () => {
    const expanded = burgerBtn.getAttribute('aria-expanded') === 'true';
    burgerBtn.setAttribute('aria-expanded', String(!expanded));
    if (mobileDrawer) mobileDrawer.hidden = expanded;
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
      const servicesPayload = localServices || services;
      renderServices(servicesPayload.services || []);
    } catch (err) {
      console.error('Error initializing ICT site data:', err);
    }
  }

  init();
})();
