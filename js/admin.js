(function () {
  'use strict';

  const STORAGE_KEYS = {
    media: 'ict_preview_media_v1',
    services: 'ict_preview_services_v1',
    ghToken: 'ict_gh_token_v1',
    ghRepo: 'ict_gh_repo_v1',
    ghBranch: 'ict_gh_branch_v1'
  };

  let currentMode = 'local';
  let mediaState = { version: 1, hero: { src: 'assets/images/hero.webp', alt: '' }, works: [] };
  let servicesState = { version: 1, services: [] };
  let selectedServiceIdx = 0;
  let pendingHeroBlob = null;

  const toastEl = document.getElementById('adminToast');

  function showToast(message, type = 'info') {
    toastEl.textContent = message;
    toastEl.className = `adm-toast is-${type}`;
    toastEl.hidden = false;
  }

  function formatKB(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
    return `${Math.round(bytes / 1024)} КБ`;
  }

  // Convert any image File to WebP Blob via HTML5 Canvas
  async function convertImageToWebP(file, maxWidth = 1600, quality = 0.82) {
    const imgUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Не удалось прочитать изображение'));
        el.src = imgUrl;
      });

      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Браузер не поддерживает экспорт в WebP'))),
          'image/webp',
          quality
        );
      });

      const dataUrl = await blobToDataUrl(blob);
      return {
        blob,
        dataUrl,
        width,
        height,
        originalSize: file.size,
        webpSize: blob.size
      };
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function blobToBase64(blob) {
    return blobToDataUrl(blob).then((dataUrl) => String(dataUrl).split(',')[1]);
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, filename);
  }

  function getQuality() {
    return Number(document.getElementById('webpQuality').value || 82) / 100;
  }

  // GitHub API Helpers
  function getGithubConfig() {
    const repo = document.getElementById('ghRepo').value.trim();
    const branch = document.getElementById('ghBranch').value.trim() || 'main';
    const token = document.getElementById('ghToken').value.trim();
    if (!repo || !token) {
      throw new Error('Укажите репозиторий (owner/repo) и GitHub Token в настройках режима GitHub API');
    }
    if (document.getElementById('ghRemember').checked) {
      localStorage.setItem(STORAGE_KEYS.ghToken, token);
    } else {
      sessionStorage.setItem(STORAGE_KEYS.ghToken, token);
    }
    localStorage.setItem(STORAGE_KEYS.ghRepo, repo);
    localStorage.setItem(STORAGE_KEYS.ghBranch, branch);
    return { repo, branch, token };
  }

  async function githubPutFile(repoPath, base64Content, commitMessage) {
    const { repo, branch, token } = getGithubConfig();
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${repoPath}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };

    let sha;
    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    const body = {
      message: commitMessage,
      content: base64Content,
      branch
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      throw new Error(`GitHub API (${putRes.status}): ${errData.message || 'Ошибка сохранения'}`);
    }
    return putRes.json();
  }

  // PHP / Server API Helpers (uses HttpOnly session cookie from .env auth)
  async function phpUploadWebp(blob, targetFilename, slotMeta) {
    const fd = new FormData();
    fd.append('file', blob, targetFilename);
    fd.append('filename', targetFilename);
    fd.append('mediaJson', JSON.stringify(mediaState));
    if (slotMeta) fd.append('slot', slotMeta);

    const res = await fetch('admin/api/upload.php', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Ошибка сервера (${res.status})`);
    }
    return data;
  }

  async function phpSaveServices(payload) {
    const res = await fetch('admin/api/save-services.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Ошибка сохранения услуг (${res.status})`);
    }
    return data;
  }

  // Unified save for image + media.json
  async function saveImageAndMedia(blob, dataUrl, repoRelPath, commitMsg, applyLocalFn) {
    applyLocalFn();

    if (currentMode === 'local') {
      const localCopy = structuredClone(mediaState);
      if (repoRelPath === 'assets/images/hero-emblem.webp') {
        localCopy.hero.src = dataUrl;
      } else if (Array.isArray(localCopy.gallery)) {
        localCopy.gallery.forEach((item) => {
          if (item.src === repoRelPath) item.src = dataUrl;
        });
      }
      localStorage.setItem(STORAGE_KEYS.media, JSON.stringify(localCopy));
      showToast('Фото сконвертировано в WebP и применено в локальном предпросмотре. Откройте index.html для проверки!', 'success');
      return;
    }

    if (currentMode === 'github') {
      showToast('Отправка WebP-файла в GitHub...', 'info');
      const b64Img = await blobToBase64(blob);
      await githubPutFile(repoRelPath, b64Img, commitMsg);
      const b64Json = utf8ToBase64(JSON.stringify(mediaState, null, 2));
      await githubPutFile('data/media.json', b64Json, 'Update data/media.json from ICT Admin');
      localStorage.removeItem(STORAGE_KEYS.media);
      showToast(`Успешно опубликовано в GitHub: ${repoRelPath} и data/media.json`, 'success');
      return;
    }

    if (currentMode === 'php') {
      showToast('Загрузка WebP-файла на PHP-сервер...', 'info');
      const filename = repoRelPath.split('/').pop();
      await phpUploadWebp(blob, filename, repoRelPath);
      localStorage.removeItem(STORAGE_KEYS.media);
      showToast(`Сохранено на сервере: ${repoRelPath}`, 'success');
    }
  }

  // Hero Uploader
  const heroInput = document.getElementById('heroFileInput');
  const heroPreviewImg = document.getElementById('heroPreviewImg');
  const heroStats = document.getElementById('heroStats');
  const btnSaveHero = document.getElementById('btnSaveHero');
  const btnDownloadHero = document.getElementById('btnDownloadHero');

  async function handleHeroFile(file) {
    if (!file) return;
    try {
      const result = await convertImageToWebP(file, 1920, getQuality());
      pendingHeroBlob = result;
      heroPreviewImg.src = result.dataUrl;
      const savedPct = Math.max(0, Math.round((1 - result.webpSize / result.originalSize) * 100));
      heroStats.textContent = `WebP готов (${result.width}×${result.height}): было ${formatKB(result.originalSize)} → стало ${formatKB(result.webpSize)} (экономия ${savedPct}%)`;
      heroStats.hidden = false;
      btnSaveHero.disabled = false;
      btnDownloadHero.disabled = false;
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  heroInput.addEventListener('change', (e) => handleHeroFile(e.target.files[0]));
  setupDropzone(document.querySelector('label[for="heroFileInput"]'), handleHeroFile);

  btnSaveHero.addEventListener('click', async () => {
    if (!pendingHeroBlob) return;
    try {
      await saveImageAndMedia(
        pendingHeroBlob.blob,
        pendingHeroBlob.dataUrl,
        'assets/images/hero-emblem.webp',
        'Update hero-emblem.webp via ICT Admin',
        () => {
          mediaState.hero.src = 'assets/images/hero-emblem.webp';
        }
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  btnDownloadHero.addEventListener('click', () => {
    if (pendingHeroBlob) downloadBlob(pendingHeroBlob.blob, 'hero-emblem.webp');
  });

  // Our Works Photo & Video Gallery Renderer
  const worksAdminList = document.getElementById('worksAdminList');

  function renderWorksAdmin() {
    worksAdminList.innerHTML = '';
    if (!Array.isArray(mediaState.gallery)) mediaState.gallery = [];

    mediaState.gallery.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'work-pair-card';

      const head = document.createElement('div');
      head.className = 'work-pair-head';

      const badge = document.createElement('span');
      badge.className = `work-slot-label ${item.type === 'video' ? 'after' : 'before'}`;
      badge.textContent = item.type === 'video' ? 'ВИДЕО' : 'ФОТО (WebP)';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = item.title || '';
      titleInput.placeholder = 'Заголовок объекта';
      titleInput.addEventListener('input', () => {
        item.title = titleInput.value;
      });

      const capInput = document.createElement('input');
      capInput.type = 'text';
      capInput.value = item.caption || '';
      capInput.placeholder = 'Подпись / описание';
      capInput.addEventListener('input', () => {
        item.caption = capInput.value;
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'adm-btn adm-btn-sm adm-btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => {
        mediaState.gallery.splice(index, 1);
        renderWorksAdmin();
      });

      head.appendChild(badge);
      head.appendChild(titleInput);
      head.appendChild(capInput);
      head.appendChild(delBtn);
      card.appendChild(head);

      if (item.type === 'video') {
        const vidWrap = document.createElement('div');
        vidWrap.className = 'form-grid-2';

        const srcField = document.createElement('label');
        srcField.className = 'field';
        srcField.innerHTML = '<span>Путь к видео (.mp4)</span>';
        const srcInput = document.createElement('input');
        srcInput.type = 'text';
        srcInput.value = item.src || '';
        srcInput.placeholder = 'assets/videos/TPC-post-renovation.mp4';
        srcInput.addEventListener('input', () => {
          item.src = srcInput.value.trim();
        });
        srcField.appendChild(srcInput);

        const posterField = document.createElement('label');
        posterField.className = 'field';
        posterField.innerHTML = '<span>Обложка видео (poster, необязательно)</span>';
        const posterInput = document.createElement('input');
        posterInput.type = 'text';
        posterInput.value = item.poster || '';
        posterInput.placeholder = 'assets/images/work-1-after.webp';
        posterInput.addEventListener('input', () => {
          item.poster = posterInput.value.trim();
        });
        posterField.appendChild(posterInput);

        vidWrap.appendChild(srcField);
        vidWrap.appendChild(posterField);
        card.appendChild(vidWrap);
      } else {
        card.appendChild(createGalleryPhotoSlot(item));
      }

      worksAdminList.appendChild(card);
    });
  }

  function createGalleryPhotoSlot(item) {
    const slot = document.createElement('div');
    slot.className = 'photo-editor-grid';

    const targetPath = item.src && item.src.startsWith('assets/images/')
      ? item.src
      : `assets/images/${item.id}.webp`;
    let pending = null;

    const previewBox = document.createElement('div');
    previewBox.className = 'photo-preview-box';
    const img = document.createElement('img');
    img.src = item.src || '';
    img.alt = item.title || 'Фото объекта';
    previewBox.appendChild(img);

    const controls = document.createElement('div');
    controls.className = 'photo-controls-box';

    const inputId = `file-${item.id}-${Math.random().toString(36).slice(2, 6)}`;
    const dropLabel = document.createElement('label');
    dropLabel.className = 'dropzone';
    dropLabel.htmlFor = inputId;
    dropLabel.innerHTML = `<input type="file" id="${inputId}" accept="image/*" hidden><span class="dropzone-title">Выбрать фото объекта</span><span class="dropzone-sub">Конвертация в WebP (до 1400px) · ${targetPath}</span>`;

    const statsEl = document.createElement('div');
    statsEl.className = 'conversion-stats';
    statsEl.hidden = true;

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'adm-btn adm-btn-sm adm-btn-primary';
    saveBtn.textContent = 'Сохранить (WebP)';
    saveBtn.disabled = true;

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'adm-btn adm-btn-sm adm-btn-ghost';
    dlBtn.textContent = 'Скачать .webp';
    dlBtn.disabled = true;

    async function onFile(file) {
      if (!file) return;
      try {
        const res = await convertImageToWebP(file, 1400, getQuality());
        pending = res;
        img.src = res.dataUrl;
        const pct = Math.max(0, Math.round((1 - res.webpSize / res.originalSize) * 100));
        statsEl.textContent = `WebP (${res.width}×${res.height}): ${formatKB(res.originalSize)} → ${formatKB(res.webpSize)} (-${pct}%)`;
        statsEl.hidden = false;
        saveBtn.disabled = false;
        dlBtn.disabled = false;
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    dropLabel.querySelector('input').addEventListener('change', (e) => onFile(e.target.files[0]));
    setupDropzone(dropLabel, onFile);

    saveBtn.addEventListener('click', async () => {
      if (!pending) return;
      try {
        await saveImageAndMedia(
          pending.blob,
          pending.dataUrl,
          targetPath,
          `Update ${targetPath} via ICT Admin`,
          () => {
            item.src = targetPath;
          }
        );
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    dlBtn.addEventListener('click', () => {
      if (pending) downloadBlob(pending.blob, `${item.id}.webp`);
    });

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(dlBtn);
    controls.appendChild(dropLabel);
    controls.appendChild(statsEl);
    controls.appendChild(btnRow);

    slot.appendChild(previewBox);
    slot.appendChild(controls);
    return slot;
  }

  document.getElementById('btnAddGalleryPhoto').addEventListener('click', () => {
    if (!Array.isArray(mediaState.gallery)) mediaState.gallery = [];
    const id = `work-photo-${Date.now().toString(36)}`;
    mediaState.gallery.push({
      id,
      type: 'photo',
      src: '',
      title: `Объект #${mediaState.gallery.length + 1}`,
      caption: 'Выполненная уборка'
    });
    renderWorksAdmin();
  });

  document.getElementById('btnAddGalleryVideo').addEventListener('click', () => {
    if (!Array.isArray(mediaState.gallery)) mediaState.gallery = [];
    const id = `work-video-${Date.now().toString(36)}`;
    mediaState.gallery.push({
      id,
      type: 'video',
      src: 'assets/videos/TPC-post-renovation.mp4',
      poster: 'assets/images/work-1-after.webp',
      title: 'Видео с объекта',
      caption: 'Выполненная работа ICT'
    });
    renderWorksAdmin();
  });

  document.getElementById('btnSaveMediaJson').addEventListener('click', async () => {
    try {
      if (currentMode === 'local') {
        localStorage.setItem(STORAGE_KEYS.media, JSON.stringify(mediaState));
        downloadJson(mediaState, 'media.json');
        showToast('media.json сохранён в локальный предпросмотр и скачан', 'success');
      } else if (currentMode === 'github') {
        const b64 = utf8ToBase64(JSON.stringify(mediaState, null, 2));
        await githubPutFile('data/media.json', b64, 'Update data/media.json via ICT Admin');
        showToast('data/media.json опубликован в GitHub', 'success');
      } else if (currentMode === 'php') {
        const fd = new FormData();
        fd.append('mediaJson', JSON.stringify(mediaState));
        const res = await fetch('admin/api/upload.php', {
          method: 'POST',
          credentials: 'same-origin',
          body: fd
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка сохранения media.json');
        showToast('data/media.json сохранён на сервере', 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // SERVICES EDITOR (TAB 2)
  const servicesNavList = document.getElementById('servicesNavList');
  const servicesCount = document.getElementById('servicesCount');
  const srvTitleInput = document.getElementById('srvTitleInput');
  const includedEditorList = document.getElementById('includedEditorList');
  const excludedEditorList = document.getElementById('excludedEditorList');
  const extrasEditorList = document.getElementById('extrasEditorList');

  function renderServicesSidebar() {
    servicesCount.textContent = String(servicesState.services.length);
    servicesNavList.innerHTML = '';
    servicesState.services.forEach((srv, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `srv-nav-btn ${idx === selectedServiceIdx ? 'is-active' : ''}`;
      btn.textContent = srv.title || `Услуга #${idx + 1}`;
      btn.addEventListener('click', () => {
        selectedServiceIdx = idx;
        renderServicesSidebar();
        renderActiveServiceEditor();
      });
      servicesNavList.appendChild(btn);
    });
  }

  const srvPriceLabelInput = document.getElementById('srvPriceLabelInput');

  function renderActiveServiceEditor() {
    const srv = servicesState.services[selectedServiceIdx];
    if (!srv) return;

    document.getElementById('editorServiceHeading').textContent = `Услуга: ${srv.title}`;
    srvTitleInput.value = srv.title || '';
    if (srvPriceLabelInput) srvPriceLabelInput.value = srv.priceLabel || '';

    renderStringListEditor(includedEditorList, srv.included, 'Что входит в стоимость...');
    renderStringListEditor(excludedEditorList, srv.excluded, 'Что не входит в услугу...');
    renderExtrasEditor(srv.extras);
  }

  srvTitleInput.addEventListener('input', () => {
    const srv = servicesState.services[selectedServiceIdx];
    if (!srv) return;
    srv.title = srvTitleInput.value;
    document.getElementById('editorServiceHeading').textContent = `Услуга: ${srv.title}`;
    renderServicesSidebar();
  });

  srvPriceLabelInput?.addEventListener('input', () => {
    const srv = servicesState.services[selectedServiceIdx];
    if (!srv) return;
    srv.priceLabel = srvPriceLabelInput.value;
  });

  function renderStringListEditor(container, list, placeholder) {
    container.innerHTML = '';
    list.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'dynamic-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = item;
      input.placeholder = placeholder;
      input.addEventListener('input', () => {
        list[idx] = input.value;
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'adm-btn adm-btn-sm adm-btn-danger';
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить пункт';
      delBtn.addEventListener('click', () => {
        list.splice(idx, 1);
        renderStringListEditor(container, list, placeholder);
      });

      row.appendChild(input);
      row.appendChild(delBtn);
      container.appendChild(row);
    });
  }

  function renderExtrasEditor(extras) {
    extrasEditorList.innerHTML = '';
    extras.forEach((extra, idx) => {
      const row = document.createElement('div');
      row.className = 'extra-editor-row';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = extra.name || '';
      nameInput.placeholder = 'Название доп. работы (слева)';

      const priceInput = document.createElement('input');
      priceInput.type = 'text';
      priceInput.value = extra.price || '';
      priceInput.placeholder = 'Цена (напр. 1 500)';

      const unitSelect = document.createElement('select');
      ['услуга', 'час', 'м²', 'шт.', 'договорная'].forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u === 'договорная' ? 'договорная' : `руб./${u}`;
        if ((extra.unit || 'услуга') === u) opt.selected = true;
        unitSelect.appendChild(opt);
      });

      const preview = document.createElement('span');
      preview.className = 'extra-preview-pill';
      const updatePreview = () => {
        if (unitSelect.value === 'договорная' && !priceInput.value.trim()) {
          preview.textContent = 'Цена договорная';
        } else {
          preview.textContent = `от ${priceInput.value || '...'} руб./${unitSelect.value}`;
        }
      };
      updatePreview();

      nameInput.addEventListener('input', () => {
        extra.name = nameInput.value;
      });
      priceInput.addEventListener('input', () => {
        extra.price = priceInput.value;
        updatePreview();
      });
      unitSelect.addEventListener('change', () => {
        extra.unit = unitSelect.value;
        updatePreview();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'adm-btn adm-btn-sm adm-btn-danger';
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить доп. работу';
      delBtn.addEventListener('click', () => {
        extras.splice(idx, 1);
        renderExtrasEditor(extras);
      });

      row.appendChild(nameInput);
      row.appendChild(priceInput);
      row.appendChild(unitSelect);
      row.appendChild(preview);
      row.appendChild(delBtn);
      extrasEditorList.appendChild(row);
    });
  }

  document.getElementById('btnAddIncluded').addEventListener('click', () => {
    const srv = servicesState.services[selectedServiceIdx];
    if (!srv) return;
    srv.included.push('');
    renderActiveServiceEditor();
  });

  document.getElementById('btnAddExcluded').addEventListener('click', () => {
    const srv = servicesState.services[selectedServiceIdx];
    if (!srv) return;
    srv.excluded.push('');
    renderActiveServiceEditor();
  });

  document.getElementById('btnAddExtra').addEventListener('click', () => {
    const srv = servicesState.services[selectedServiceIdx];
    if (!srv) return;
    srv.extras.push({ name: '', price: '1 000', unit: 'услуга' });
    renderActiveServiceEditor();
  });

  document.getElementById('btnDownloadServices').addEventListener('click', () => {
    downloadJson(servicesState, 'services.json');
  });

  document.getElementById('btnSaveServices').addEventListener('click', async () => {
    try {
      if (currentMode === 'local') {
        localStorage.setItem(STORAGE_KEYS.services, JSON.stringify(servicesState));
        showToast('Услуги и цены сохранены в локальный предпросмотр. Откройте index.html и нажмите «Подробнее»!', 'success');
      } else if (currentMode === 'github') {
        showToast('Публикация data/services.json в GitHub...', 'info');
        const b64 = utf8ToBase64(JSON.stringify(servicesState, null, 2));
        await githubPutFile('data/services.json', b64, 'Update data/services.json via ICT Admin');
        localStorage.removeItem(STORAGE_KEYS.services);
        showToast('Перечень услуг и цены опубликованы в GitHub!', 'success');
      } else if (currentMode === 'php') {
        showToast('Сохранение услуг на PHP-сервере...', 'info');
        await phpSaveServices(servicesState);
        localStorage.removeItem(STORAGE_KEYS.services);
        showToast('data/services.json успешно сохранён на PHP-сервере!', 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Helpers: Dropzone, Tabs, Modes
  function setupDropzone(el, onFile) {
    if (!el) return;
    ['dragenter', 'dragover'].forEach((ev) => {
      el.addEventListener(ev, (e) => {
        e.preventDefault();
        el.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      el.addEventListener(ev, (e) => {
        e.preventDefault();
        el.classList.remove('is-dragover');
      });
    });
    el.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    });
  }

  document.querySelectorAll('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      document.getElementById('modePanelLocal').hidden = currentMode !== 'local';
      document.getElementById('modePanelGithub').hidden = currentMode !== 'github';
      document.getElementById('modePanelPhp').hidden = currentMode !== 'php';
    });
  });

  document.querySelectorAll('.section-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.section-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      document.getElementById('tabPhotos').hidden = tab !== 'photos';
      document.getElementById('tabServices').hidden = tab !== 'services';
    });
  });

  document.getElementById('webpQuality').addEventListener('input', (e) => {
    document.getElementById('webpQualityVal').textContent = `${e.target.value}%`;
  });

  document.getElementById('btnResetLocal').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.media);
    localStorage.removeItem(STORAGE_KEYS.services);
    showToast('Локальный предпросмотр сброшен. Перезагрузите страницу для загрузки данных с диска.', 'info');
  });

  // =========================================================================
  // Secure Authentication (.env + PBKDF2-SHA256 + HMAC-SHA256 Challenge)
  // =========================================================================
  const authOverlay = document.getElementById('authOverlay');
  const adminApp = document.getElementById('adminApp');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const currentUserPill = document.getElementById('currentUserPill');
  const credsModal = document.getElementById('credsModal');
  const credsForm = document.getElementById('credsForm');
  const credsError = document.getElementById('credsError');

  let currentAdminLogin = '';
  let dataLoaded = false;

  function bufToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function randomHex(byteLen) {
    const arr = new Uint8Array(byteLen);
    crypto.getRandomValues(arr);
    return bufToHex(arr.buffer);
  }

  async function derivePbkdf2Hex(password, salt, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: Number(iterations),
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    return bufToHex(bits);
  }

  async function computeHmacHex(secretHexKey, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretHexKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return bufToHex(sig);
  }

  async function fetchChallenge() {
    const res = await fetch(`admin/api/auth.php?action=challenge&t=${Date.now()}`, {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Сервер авторизации недоступен. Запустите сайт через server.py или PHP-хостинг.');
    }
    return data;
  }

  function showAuthenticatedUI(login) {
    currentAdminLogin = login;
    currentUserPill.textContent = `Вход: ${login}`;
    authOverlay.hidden = true;
    adminApp.hidden = false;
    if (!dataLoaded) {
      dataLoaded = true;
      loadAdminData();
    }
  }

  function showLoginUI() {
    currentAdminLogin = '';
    adminApp.hidden = true;
    credsModal.hidden = true;
    authOverlay.hidden = false;
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginUsername').focus();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const submitBtn = document.getElementById('btnLoginSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Проверка...';

    try {
      const login = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const ch = await fetchChallenge();
      const derivedHash = await derivePbkdf2Hex(password, ch.salt, ch.iterations);
      const proof = await computeHmacHex(derivedHash, `${ch.nonce}:${login}`);

      const res = await fetch('admin/api/auth.php?action=login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, nonce: ch.nonce, proof })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Неверный логин или пароль');
      }
      document.getElementById('loginPassword').value = '';
      showAuthenticatedUI(data.login);
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Войти';
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await fetch('admin/api/auth.php?action=logout', {
      method: 'POST',
      credentials: 'same-origin'
    }).catch(() => {});
    showLoginUI();
  });

  document.getElementById('btnOpenCreds').addEventListener('click', () => {
    credsError.hidden = true;
    credsForm.reset();
    document.getElementById('credNewLogin').value = currentAdminLogin;
    credsModal.hidden = false;
    document.getElementById('credCurrentPassword').focus();
  });

  document.getElementById('btnCredsCancel').addEventListener('click', () => {
    credsModal.hidden = true;
  });

  credsModal.addEventListener('click', (e) => {
    if (e.target === credsModal) credsModal.hidden = true;
  });

  credsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    credsError.hidden = true;
    const btn = document.getElementById('btnCredsSubmit');
    btn.disabled = true;

    try {
      const curPwd = document.getElementById('credCurrentPassword').value;
      const newLogin = document.getElementById('credNewLogin').value.trim();
      const newPwd = document.getElementById('credNewPassword').value;
      const confirmPwd = document.getElementById('credConfirmPassword').value;

      if (newLogin.length < 3) throw new Error('Логин должен содержать минимум 3 символа');
      if (newPwd.length < 6) throw new Error('Новый пароль должен содержать минимум 6 символов');
      if (newPwd !== confirmPwd) throw new Error('Новые пароли не совпадают');

      const ch = await fetchChallenge();
      const curDerived = await derivePbkdf2Hex(curPwd, ch.salt, ch.iterations);
      const currentProof = await computeHmacHex(curDerived, `${ch.nonce}:${currentAdminLogin}`);

      const newSalt = randomHex(16);
      const iterations = 120000;
      const newHash = await derivePbkdf2Hex(newPwd, newSalt, iterations);

      const res = await fetch('admin/api/auth.php?action=change-credentials', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nonce: ch.nonce,
          currentProof,
          newLogin,
          newSalt,
          newHash,
          iterations
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Не удалось обновить учётные данные');
      }

      currentAdminLogin = data.login;
      currentUserPill.textContent = `Вход: ${data.login}`;
      credsModal.hidden = true;
      credsForm.reset();
      showToast('Логин и пароль успешно обновлены и сохранены в .env в зашифрованном (хешированном) виде.', 'success');
    } catch (err) {
      credsError.textContent = err.message;
      credsError.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // Load admin data after authentication
  async function loadAdminData() {
    const savedRepo = localStorage.getItem(STORAGE_KEYS.ghRepo);
    const savedBranch = localStorage.getItem(STORAGE_KEYS.ghBranch);
    const savedToken = localStorage.getItem(STORAGE_KEYS.ghToken) || sessionStorage.getItem(STORAGE_KEYS.ghToken);
    if (savedRepo) document.getElementById('ghRepo').value = savedRepo;
    if (savedBranch) document.getElementById('ghBranch').value = savedBranch;
    if (savedToken) document.getElementById('ghToken').value = savedToken;

    try {
      const [mediaRes, srvRes] = await Promise.all([
        fetch(`data/media.json?v=${Date.now()}`, { cache: 'no-store' }),
        fetch(`data/services.json?v=${Date.now()}`, { cache: 'no-store' })
      ]);
      const localMedia = JSON.parse(localStorage.getItem(STORAGE_KEYS.media) || 'null');
      const localServices = JSON.parse(localStorage.getItem(STORAGE_KEYS.services) || 'null');

      mediaState = localMedia || (await mediaRes.json());
      servicesState = localServices || (await srvRes.json());

      if (mediaState.hero?.src) {
        heroPreviewImg.src = mediaState.hero.src;
      }
      renderWorksAdmin();
      renderServicesSidebar();
      renderActiveServiceEditor();
    } catch (err) {
      showToast(`Не удалось загрузить данные: ${err.message}`, 'error');
    }
  }

  async function checkSession() {
    try {
      const res = await fetch(`admin/api/auth.php?action=session&t=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.authenticated) {
        showAuthenticatedUI(data.login);
        return;
      }
    } catch (_) {}
    showLoginUI();
  }

  checkSession();
})();
