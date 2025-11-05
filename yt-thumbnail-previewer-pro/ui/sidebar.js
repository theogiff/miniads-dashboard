const ACCEPTED_PROTOCOLS = ['https:'];

export function initSidebar(shadowRoot, initialState, callbacks) {
  const sidebar = shadowRoot.querySelector('.sidebar');
  const collapseToggle = shadowRoot.getElementById('collapseToggle');
  const toggleEnabled = shadowRoot.getElementById('toggleEnabled');
  const resetButton = shadowRoot.getElementById('resetState');
  const fileInput = shadowRoot.getElementById('fileInput');
  const urlInput = shadowRoot.getElementById('urlInput');
  const applyUrl = shadowRoot.getElementById('applyUrl');
  const preview = shadowRoot.getElementById('thumbPreview');
  const previewImage = shadowRoot.getElementById('previewImage');
  const opacityRange = shadowRoot.getElementById('overlayOpacity');
  const opacityValue = shadowRoot.getElementById('opacityValue');
  const sliderLabel = shadowRoot.querySelector('.slider-label');
  const tileIndicator = shadowRoot.getElementById('tileIndicator');
  const countIndicator = shadowRoot.getElementById('countIndicator');
  const randomBtn = shadowRoot.getElementById('randomTile');
  const nextBtn = shadowRoot.getElementById('nextTile');
  const selectManualBtn = shadowRoot.getElementById('selectManual');
  const pinBtn = shadowRoot.getElementById('pinTile');
  const titleInput = shadowRoot.getElementById('titleInput');
  const addTitleBtn = shadowRoot.getElementById('addTitle');
  const titleList = shadowRoot.getElementById('titleList');
  const channelInput = shadowRoot.getElementById('channelInput');
  const pillYour = shadowRoot.getElementById('pillYour');
  const pillTrending = shadowRoot.getElementById('pillTrending');

  const radioApply = Array.from(shadowRoot.querySelectorAll('input[name="applyMode"]'));
  const radioScope = Array.from(shadowRoot.querySelectorAll('input[name="scopeMode"]'));

  let state = { ...initialState };
  let collapsed = false;

  function renderPreview(image) {
    if (image) {
      preview.classList.add('thumb-preview--has-image');
      previewImage.src = image;
    } else {
      preview.classList.remove('thumb-preview--has-image');
      previewImage.removeAttribute('src');
    }
  }

  function renderTitles() {
    titleList.innerHTML = '';
    state.titles.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'title-item';
      const label = document.createElement('label');
      label.className = 'title-item__label';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'titleChoice';
      radio.value = item.id;
      radio.checked = state.activeTitleId === item.id;
      radio.addEventListener('change', () => {
        callbacks.onTitleSelect?.(item.id);
      });
      const text = document.createElement('span');
      text.className = 'title-item__text';
      text.textContent = item.text;
      const remove = document.createElement('button');
      remove.className = 'title-item__remove';
      remove.type = 'button';
      remove.textContent = '✕';
      remove.title = 'Supprimer';
      remove.addEventListener('click', () => {
        callbacks.onTitleRemove?.(item.id);
      });
      label.append(radio, text);
      li.append(label, remove);
      titleList.appendChild(li);
    });
  }

  function renderPills() {
    const mode = state.pillMode;
    if (mode === 'your') {
      pillYour.classList.add('pill--active');
      pillYour.setAttribute('aria-pressed', 'true');
      pillTrending.classList.remove('pill--active');
      pillTrending.setAttribute('aria-pressed', 'false');
    } else {
      pillTrending.classList.add('pill--active');
      pillTrending.setAttribute('aria-pressed', 'true');
      pillYour.classList.remove('pill--active');
      pillYour.setAttribute('aria-pressed', 'false');
    }
  }

  function syncUI() {
    toggleEnabled.checked = state.enabled;
    channelInput.value = state.mockChannelName || '';
    radioApply.forEach((radio) => {
      radio.checked = radio.value === state.mode;
    });
    radioScope.forEach((radio) => {
      radio.checked = radio.value === state.scope;
    });
    opacityRange.value = String(state.opacity ?? 80);
    opacityValue.textContent = `${state.opacity ?? 80}%`;
    const overlayActive = state.mode === 'overlay';
    opacityRange.disabled = !overlayActive;
    sliderLabel?.classList.toggle('slider-label--disabled', !overlayActive);
    pinBtn.classList.toggle('btn--active', Boolean(state.pinnedTileId));
    pinBtn.textContent = state.pinnedTileId ? 'Pinned' : 'Pin this tile';
    renderPreview(state.imageData);
    renderTitles();
    renderPills();
  }

  function applyCollapsed(value) {
    collapsed = Boolean(value);
    sidebar.classList.toggle('sidebar--collapsed', collapsed);
    collapseToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  collapseToggle.addEventListener('click', () => {
    applyCollapsed(!collapsed);
    callbacks.onCollapse?.(!collapsed);
  });

  toggleEnabled.addEventListener('change', () => {
    callbacks.onToggle?.(toggleEnabled.checked);
  });

  resetButton.addEventListener('click', () => {
    callbacks.onReset?.();
  });

  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files || [];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      callbacks.onNotify?.('Le fichier doit être une image.');
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      callbacks.onImageData?.(reader.result);
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  applyUrl.addEventListener('click', () => {
    const value = urlInput.value.trim();
    if (!value) {
      callbacks.onNotify?.('Renseigne une URL valide.');
      return;
    }
    try {
      const url = new URL(value);
      if (!ACCEPTED_PROTOCOLS.includes(url.protocol)) {
        throw new Error('Protocol not allowed');
      }
      const extension = (url.pathname.split('.').pop() || '').toLowerCase();
      const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (!allowed.includes(extension)) {
        throw new Error('Extension not allowed');
      }
      callbacks.onImageUrl?.(url.toString());
    } catch (err) {
      callbacks.onNotify?.('URL non valide.');
    }
  });

  radioApply.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        callbacks.onModeChange?.(radio.value);
      }
    });
  });

  radioScope.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        callbacks.onScopeChange?.(radio.value);
      }
    });
  });

  opacityRange.addEventListener('input', () => {
    const value = Number(opacityRange.value);
    opacityValue.textContent = `${value}%`;
    callbacks.onOpacityChange?.(value);
  });

  randomBtn.addEventListener('click', () => {
    callbacks.onRandom?.();
  });

  nextBtn.addEventListener('click', () => {
    callbacks.onNextRandom?.();
  });

  selectManualBtn.addEventListener('click', () => {
    callbacks.onManualSelect?.();
  });

  pinBtn.addEventListener('click', () => {
    callbacks.onPin?.();
  });

  addTitleBtn.addEventListener('click', () => {
    const text = titleInput.value.trim();
    if (!text) {
      callbacks.onNotify?.('Ajoute un titre.');
      return;
    }
    callbacks.onTitleAdd?.(text);
    titleInput.value = '';
  });

  channelInput.addEventListener('input', () => {
    callbacks.onChannelChange?.(channelInput.value);
  });

  pillYour.addEventListener('click', () => {
    callbacks.onPillChange?.('your');
  });

  pillTrending.addEventListener('click', () => {
    callbacks.onPillChange?.('trending');
  });

  syncUI();

  return {
    updateState(nextState) {
      state = { ...state, ...nextState };
      syncUI();
    },
    updateTileIndicator(text) {
      tileIndicator.textContent = text || 'Aucune';
    },
    updateCount(count) {
      countIndicator.textContent = String(count);
    },
    setOpen(isOpen) {
      applyCollapsed(!Boolean(isOpen));
    }
  };
}
