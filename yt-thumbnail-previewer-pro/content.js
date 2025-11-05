(async () => {
  const DEFAULT_STATE = () => ({
    enabled: true,
    mode: 'replace',
    opacity: 80,
    imageData: null,
    titles: [],
    activeTitleId: null,
    mockChannelName: 'Miniads Channel',
    pillMode: 'your',
    scope: 'all',
    pinnedTileId: null
  });

  const [{ createShadowHost, renderSidebar, debounce, formatNumber, randomInt }, selectors, sidebarUI, youtubeUtils] = await Promise.all([
    import(chrome.runtime.getURL('utils/dom.js')),
    import(chrome.runtime.getURL('selectors.js')),
    import(chrome.runtime.getURL('ui/sidebar.js')),
    import(chrome.runtime.getURL('utils/youtube.js'))
  ]);

  const sidebarHtml = await fetch(chrome.runtime.getURL('ui/sidebar.html')).then((r) => r.text());
  const sidebarCss = await fetch(chrome.runtime.getURL('ui/sidebar.css')).then((r) => r.text());

  const host = createShadowHost('ytp-sidebar');
  const { shadowRoot } = renderSidebar(host, sidebarHtml, sidebarCss);

  const storageSnapshot = await chrome.storage.local.get({
    ytpState: null,
    ytpPanelOpen: true
  });

  let state = { ...DEFAULT_STATE(), ...(storageSnapshot.ytpState || {}) };
  let panelOpen = storageSnapshot.ytpPanelOpen !== false;
  let currentTileId = state.pinnedTileId || null;
  let manualMode = false;
  const appliedTiles = new Map();
  let tilesCache = [];

  const notify = (text) => {
    console.info('[YT Thumbnail Previewer Pro]', text);
  };

  const sidebar = sidebarUI.initSidebar(shadowRoot, state, {
    onCollapse(open) {
      panelOpen = open;
      updateBodyClasses();
      savePanelState();
    },
    onToggle(enabled) {
      updateState({ enabled });
    },
    onReset() {
      state = DEFAULT_STATE();
      currentTileId = null;
      chrome.storage.local.set({ ytpState: state });
      sidebar.updateState(state);
      sidebar.updateTileIndicator('Aucune');
      sidebar.updateCount(0);
      clearAllTiles();
      updateBodyClasses();
      collectAndApply();
    },
    onImageData(dataUrl) {
      updateState({ imageData: dataUrl });
    },
    onImageUrl(url) {
      updateState({ imageData: url });
    },
    onModeChange(mode) {
      updateState({ mode });
    },
    onScopeChange(scope) {
      updateState({ scope });
    },
    onOpacityChange(opacity) {
      updateState({ opacity });
    },
    onRandom() {
      selectRandomTile(false);
    },
    onNextRandom() {
      selectRandomTile(true);
    },
    onManualSelect() {
      manualMode = true;
      notify('Cliquez sur une tuile pour la sélectionner.');
    },
    onPin() {
      if (state.pinnedTileId) {
        updateState({ pinnedTileId: null });
        notify('Tuile détachée.');
      } else if (currentTileId) {
        updateState({ pinnedTileId: currentTileId });
        notify('Tuile épinglée.');
      }
    },
    onTitleAdd(text) {
      const id = `title-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const titles = [...state.titles, { id, text }];
      updateState({ titles, activeTitleId: id });
    },
    onTitleRemove(id) {
      const titles = state.titles.filter((t) => t.id !== id);
      const nextActive = state.activeTitleId === id ? titles[0]?.id || null : state.activeTitleId;
      updateState({ titles, activeTitleId: nextActive });
    },
    onTitleSelect(id) {
      updateState({ activeTitleId: id });
    },
    onChannelChange(name) {
      updateState({ mockChannelName: name });
    },
    onPillChange(mode) {
      updateState({ pillMode: mode });
    },
    onNotify(text) {
      notify(text);
    }
  });

  sidebar.setOpen(panelOpen);

  updateBodyClasses();
  collectAndApply();

  function savePanelState() {
    chrome.storage.local.set({ ytpPanelOpen: panelOpen });
  }

  function updateState(patch) {
    state = { ...state, ...patch };
    chrome.storage.local.set({ ytpState: state });
    sidebar.updateState(state);
    if (!state.enabled) {
      clearAllTiles();
    }
    collectAndApply();
    updateBodyClasses();
  }

  function updateBodyClasses() {
    document.body.classList.toggle('ytp-sidebar-open', state.enabled && panelOpen);
    document.body.classList.toggle('ytp-sidebar-collapsed', state.enabled && !panelOpen);
    document.body.classList.toggle('ytp-sidebar-hidden', !state.enabled);
  }

  function selectRandomTile(forceNext) {
    if (!tilesCache.length) {
      collectTiles();
    }
    const visibles = selectors.filterVisibleTiles(tilesCache);
    if (!visibles.length) {
      notify('Aucune tuile visible pour le moment.');
      return;
    }
    let pick;
    if (forceNext && visibles.length > 1) {
      const others = visibles.filter((info) => info.id !== currentTileId);
      if (others.length) {
        pick = others[randomInt(0, others.length - 1)];
      }
    }
    if (!pick) {
      pick = visibles[randomInt(0, visibles.length - 1)];
    }
    if (pick) {
      currentTileId = pick.id;
      manualMode = false;
      sidebar.updateTileIndicator(extractVideoIdFromTileId(currentTileId));
      highlightTile(pick.element);
      collectAndApply();
    }
  }

  function extractVideoIdFromTileId(tileId) {
    if (!tileId) return 'Aucune';
    const parts = tileId.split('::');
    return parts[parts.length - 1];
  }

  function highlightTile(tile) {
    if (!tile) return;
    tile.classList.add('ytp-manual-highlight');
    setTimeout(() => {
      tile.classList.remove('ytp-manual-highlight');
    }, 1000);
  }

  function clearAllTiles() {
    for (const [tileId] of appliedTiles) {
      removeTileEffects(tileId);
    }
    appliedTiles.clear();
    sidebar.updateCount(0);
  }

  function removeTileEffects(tileId) {
    const record = appliedTiles.get(tileId);
    if (!record) return;
    if (record.layer && record.layer.parentElement) {
      record.layer.remove();
    }
    if (record.image && record.originalOpacity !== undefined) {
      record.image.style.opacity = record.originalOpacity ?? '';
    }
    if (record.metadata && record.metadata.parentElement) {
      record.metadata.remove();
    }
    appliedTiles.delete(tileId);
  }

  function applyToTile(info, isTarget) {
    const { thumb, id } = info;
    if (!thumb) {
      return;
    }
    const wrapper = thumb.wrapper || thumb.link;
    if (!wrapper) {
      return;
    }
    const computed = window.getComputedStyle(wrapper);
    if (computed.position === 'static') {
      wrapper.style.position = 'relative';
    }
    if (state.imageData) {
      const layerClass = state.mode === 'replace' ? 'ytp-thumb-replace' : 'ytp-thumb-overlay';
      let record = appliedTiles.get(id);
      if (!record) {
        record = { id };
        appliedTiles.set(id, record);
      }
      if (record.layer && record.layer.parentElement) {
        record.layer.remove();
      }
      const layer = document.createElement('div');
      layer.className = `ytp-thumb-layer ${layerClass}`;
      layer.style.backgroundImage = `url(${state.imageData})`;
      if (state.mode === 'overlay') {
        const normalized = Math.max(0, Math.min(100, Number(state.opacity ?? 100)));
        layer.style.opacity = String(normalized / 100);
      }
      wrapper.appendChild(layer);
      record.layer = layer;
      record.image = thumb.image;
      if (record.originalOpacity === undefined) {
        record.originalOpacity = thumb.image.style.opacity;
      }
      if (state.mode === 'replace') {
        thumb.image.style.opacity = '0';
      } else {
        thumb.image.style.opacity = record.originalOpacity ?? '';
      }
    } else {
      removeTileEffects(id);
    }

    if (isTarget) {
      ensureMetadata(info);
    } else {
      const record = appliedTiles.get(id);
      if (record?.metadata) {
        record.metadata.remove();
        record.metadata = null;
      }
    }
  }

  function ensureMetadata(info) {
    const { element, id } = info;
    let record = appliedTiles.get(id);
    if (!record) {
      record = { id };
      appliedTiles.set(id, record);
    }
    if (record.metadata && record.metadata.parentElement) {
      record.metadata.remove();
    }
    const metadata = document.createElement('div');
    metadata.className = 'ytp-faux-metadata';
    const avatar = document.createElement('div');
    avatar.className = 'ytp-faux-avatar';
    const name = (state.mockChannelName || 'Miniads').trim();
    avatar.textContent = name ? name.slice(0, 2).toUpperCase() : 'YT';

    const details = document.createElement('div');
    details.className = 'ytp-faux-details';
    const pill = document.createElement('span');
    pill.className = `ytp-pill-mode ${state.pillMode === 'trending' ? 'ytp-pill-trending' : 'ytp-pill-your'}`;
    pill.textContent = state.pillMode === 'trending' ? 'Tendances' : 'Your Video';
    const title = document.createElement('p');
    title.textContent = getActiveTitleText();
    title.style.margin = '0';
    title.style.fontWeight = '600';
    title.style.fontSize = '14px';

    const stats = document.createElement('p');
    stats.style.margin = '0';
    stats.style.fontSize = '12px';
    stats.style.color = 'rgba(255, 255, 255, 0.6)';
    const fakeViews = generateViews(id);
    const fakeAge = generateAge(id);
    stats.textContent = `${name || 'Miniads'} • ${fakeViews} vues • ${fakeAge}`;

    details.append(pill, title, stats);
    metadata.append(avatar, details);
    element.appendChild(metadata);
    record.metadata = metadata;
  }

  function getActiveTitleText() {
    const active = state.titles.find((t) => t.id === state.activeTitleId);
    if (active) {
      return active.text;
    }
    return 'Your New Video Title';
  }

  function generateViews(tileId) {
    const base = Math.abs(selectors.hashCode(tileId));
    const views = 10000 + (base % 9000000);
    return formatNumber(views);
  }

  function generateAge(tileId) {
    const base = Math.abs(selectors.hashCode(`${tileId}-age`));
    const hours = 1 + (base % 72);
    if (hours < 24) {
      return `${hours} heures`;
    }
    const days = Math.floor(hours / 24);
    return `${days} jours`;
  }

  function collectTiles() {
    tilesCache = selectors.uniqueTiles(
      selectors.getTileCandidates().map(({ element, def }) => ({
        element,
        def,
        id: selectors.getTileIdentity(element, def.type),
        thumb: selectors.getThumbnailElements(element)
      }))
    ).filter((info) => info.thumb);
    return tilesCache;
  }

  function collectAndApply() {
    collectTiles();
    applyStateToTiles();
  }

  const applyStateToTiles = debounce(() => {
    if (!state.enabled) {
      clearAllTiles();
      sidebar.updateTileIndicator('Aucune');
      return;
    }
    const tiles = tilesCache.length ? tilesCache : collectTiles();
    if (!tiles.length) {
      clearAllTiles();
      sidebar.updateTileIndicator('Aucune');
      return;
    }

    let targetId = state.pinnedTileId || currentTileId;
    if (targetId && !tiles.some((info) => info.id === targetId)) {
      targetId = null;
    }
    if (!targetId) {
      targetId = tiles[0].id;
    }
    currentTileId = targetId;
    sidebar.updateTileIndicator(extractVideoIdFromTileId(targetId));

    const scopedTiles = state.scope === 'first-row' ? selectors.getFirstRowTiles(tiles) : tiles;
    const toApply = new Map(scopedTiles.map((info) => [info.id, info]));
    if (targetId && !toApply.has(targetId)) {
      const targetInfo = tiles.find((info) => info.id === targetId);
      if (targetInfo) {
        toApply.set(targetId, targetInfo);
      }
    }

    for (const [tileId] of appliedTiles) {
      if (!toApply.has(tileId) || !state.imageData) {
        removeTileEffects(tileId);
      }
    }

    for (const info of toApply.values()) {
      applyToTile(info, info.id === targetId);
    }

    const countValue = state.imageData ? appliedTiles.size : (currentTileId ? 1 : 0);
    sidebar.updateCount(countValue);
  }, 150);

  function handleManualClick(event) {
    if (!manualMode) {
      return;
    }
    const target = event.target.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-panel-video-renderer');
    if (!target) {
      return;
    }
    manualMode = false;
    const info = tilesCache.find((item) => item.element === target);
    if (info) {
      currentTileId = info.id;
      sidebar.updateTileIndicator(extractVideoIdFromTileId(currentTileId));
      highlightTile(info.element);
      collectAndApply();
    }
  }

  document.addEventListener('click', handleManualClick, true);

  youtubeUtils.watchNavigation(() => {
    collectAndApply();
    if (state.pinnedTileId) {
      currentTileId = state.pinnedTileId;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ytpState && changes.ytpState.newValue) {
      state = { ...DEFAULT_STATE(), ...changes.ytpState.newValue };
      sidebar.updateState(state);
      collectAndApply();
      updateBodyClasses();
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'ytpPanelOpen')) {
      panelOpen = changes.ytpPanelOpen.newValue !== false;
      sidebar.setOpen(panelOpen);
      updateBodyClasses();
    }
  });
})();
