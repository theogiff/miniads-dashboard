// --- Drive / Miniatures ---

async function fetchDriveFilesForClient(slug) {
  const key = getParam("key");
  const query = key ? `?key=${encodeURIComponent(key)}` : "";
  const res = await fetch(
    `/api/client/bySlug/${encodeURIComponent(slug)}${query}`
  );

  if (!res.ok) throw new Error("API Drive KO");

  return await res.json();
}

// === NOUVELLE PARTIE ===
let currentFiles = [];

async function displayClientMiniatures(slug) {
  try {
    console.log("[Drive] Fetching miniatures for slug:", slug);
    const data = await fetchDriveFilesForClient(slug);

    currentFiles = data.files || [];
    console.log("[Drive] Got", currentFiles.length, "files. First:", currentFiles[0]?.name, "| thumb:", currentFiles[0]?.thumbnailLink);

    setMiniaturesView("folders");

    // Populate Overview "Dernières miniatures" with Drive files
    populateRecentWorkFromDrive(currentFiles);

  } catch (e) {
    console.error("[Drive] Erreur affichage miniatures:", e.message);
    if (miniaturesGrid) miniaturesGrid.innerHTML = "<p>Erreur lors du chargement des miniatures.</p>";
  }
}

viewSwitchButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    setMiniaturesView(view);
  });
});

function setMiniaturesView(view = "folders") {
  viewSwitchButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "gallery") {
    renderFilesGrid(currentFiles);
  } else {
    renderFolderView(currentFiles);
  }
}

function initializeMiniaturesFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("client");
  if (slug) {
    displayClientMiniatures(slug);
  }
}

initializeMiniaturesFromUrl();

function openMiniaturePip(file = {}) {
  if (!pipOverlay || !pipImage) return;
  const src = getMiniatureThumbnail(file.thumbnailLink);
  pipImage.src = src;
  pipImage.alt = file.name || "Miniature";
  if (pipTitle) pipTitle.textContent = file.name || "Miniature";
  if (pipSubtitle) {
    const dateText = formatDate(file.modifiedTime);
    const folderLabel = getFolderLabel(file);
    pipSubtitle.textContent = dateText !== "—"
      ? `Modifié le ${dateText} • ${folderLabel}`
      : folderLabel;
  }
  if (pipOpenLink) {
    if (file.webViewLink) {
      pipOpenLink.href = file.webViewLink;
      pipOpenLink.removeAttribute("aria-disabled");
    } else {
      pipOpenLink.href = "#";
      pipOpenLink.setAttribute("aria-disabled", "true");
    }
  }
  if (pipDownloadLink) {
    if (file.webContentLink) {
      pipDownloadLink.href = file.webContentLink;
      pipDownloadLink.removeAttribute("aria-disabled");
    } else {
      pipDownloadLink.href = "#";
      pipDownloadLink.setAttribute("aria-disabled", "true");
    }
  }
  pipOverlay.classList.add("is-visible");
  pipOverlay.setAttribute("aria-hidden", "false");
  const closeBtn = pipOverlay.querySelector(".mini-pip-close");
  if (closeBtn) closeBtn.focus();
}

function closeMiniaturePip() {
  if (!pipOverlay) return;
  pipOverlay.classList.remove("is-visible");
  pipOverlay.setAttribute("aria-hidden", "true");
}

if (pipOverlay) {
  const closeButtons = pipOverlay.querySelectorAll("[data-pip-close]");
  closeButtons.forEach(button => {
    button.addEventListener("click", () => closeMiniaturePip());
  });
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMiniaturePip();
  }
});

function renderFilesGrid(files = [], { container = miniaturesGrid, emptyLabel } = {}) {
  const targetGrid = container || miniaturesGrid;
  if (!targetGrid) return;
  updateMiniaturesGridMode("gallery", targetGrid);
  targetGrid.innerHTML = "";

  if (!files.length) {
    targetGrid.innerHTML = `<div class="miniatures-empty">${emptyLabel || "Aucune miniature pour l'instant."}</div>`;
    updateThumbFilters([], files);
    updateThumbCounter(0, 0);
    return;
  }

  // Build filter pills from folder names
  updateThumbFilters(files, files);

  const fragment = document.createDocumentFragment();

  files.forEach(file => {
    const card = document.createElement("article");
    card.className = "mini-card";
    card.dataset.folder = (file.folderName || "").toLowerCase();

    // Thumbnail image
    const thumbWrapper = document.createElement("button");
    thumbWrapper.type = "button";
    thumbWrapper.className = "mini-card-thumb";
    thumbWrapper.addEventListener("click", () => openMiniaturePip(file));

    const img = document.createElement("img");
    img.alt = file.name || "Miniature";
    img.loading = "lazy";
    img.src = getMiniatureThumbnail(file.thumbnailLink);
    thumbWrapper.appendChild(img);

    // Folder badge on image
    const folderLabel = file.folderName || "";
    if (folderLabel) {
      const chip = document.createElement("span");
      chip.className = "mini-card-chip";
      chip.textContent = folderLabel;
      thumbWrapper.appendChild(chip);
    }

    // Body: title + meta
    const body = document.createElement("div");
    body.className = "mini-card-body";

    const title = document.createElement("h3");
    title.className = "mini-card-title";
    const cleanName = (file.name || "Sans titre").replace(/\.[^.]+$/, "");
    title.textContent = cleanName;
    if (file.name) title.title = file.name;

    const meta = document.createElement("div");
    meta.className = "mini-card-meta";

    const folderMeta = document.createElement("div");
    folderMeta.className = "mini-card-meta-item";
    folderMeta.innerHTML = `<span class="mini-card-meta-label">Dossier</span><span class="mini-card-meta-value">${folderLabel || "—"}</span>`;

    const dateMeta = document.createElement("div");
    dateMeta.className = "mini-card-meta-item";
    const formattedDate = formatDate(file.modifiedTime);
    dateMeta.innerHTML = `<span class="mini-card-meta-label">Modifié</span><span class="mini-card-meta-value">${formattedDate}</span>`;

    meta.append(folderMeta, dateMeta);
    body.append(title, meta);
    card.append(thumbWrapper, body);
    fragment.appendChild(card);
  });

  // "Create New Thumbnail" card
  const newCard = document.createElement("article");
  newCard.className = "mini-card mini-card-new";
  newCard.innerHTML = `
    <a href="mailto:contact@miniads.fr?subject=Nouvelle+miniature">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      <span>Nouvelle miniature</span>
    </a>
  `;
  fragment.appendChild(newCard);

  targetGrid.appendChild(fragment);

  // Update counter
  updateThumbCounter(files.length, files.length);
}

// Thumbnail filter pills
function updateThumbFilters(visibleFiles, allFiles) {
  const filtersEl = document.getElementById("thumbFilters");
  if (!filtersEl) return;

  // Collect unique folder names
  const folders = [...new Set(allFiles.map(f => f.folderName || "").filter(Boolean))];
  filtersEl.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "th-filter-pill active";
  allBtn.dataset.filter = "all";
  allBtn.textContent = "Tout";
  filtersEl.appendChild(allBtn);

  folders.forEach(folder => {
    const btn = document.createElement("button");
    btn.className = "th-filter-pill";
    btn.dataset.filter = folder.toLowerCase();
    btn.textContent = folder;
    filtersEl.appendChild(btn);
  });

  // Click handler
  filtersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".th-filter-pill");
    if (!btn) return;
    filtersEl.querySelectorAll(".th-filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const filter = btn.dataset.filter;
    const grid = document.getElementById("miniaturesGrid");
    if (!grid) return;

    let shown = 0;
    grid.querySelectorAll(".mini-card").forEach(card => {
      if (card.classList.contains("mini-card-new")) return; // always show
      const folder = card.dataset.folder || "";
      const visible = filter === "all" || folder === filter;
      card.style.display = visible ? "" : "none";
      if (visible) shown++;
    });

    updateThumbCounter(shown, allFiles.length);
  }, { once: false });
}

function updateThumbCounter(shown, total) {
  const counter = document.getElementById("thumbCounter");
  if (counter) {
    counter.textContent = `${shown} sur ${total} miniatures`;
  }
}

function extractVersion(name) {
  const match = name.match(/v(\d+)/i);
  return match ? "V" + match[1] : null;
}

function truncateText(value = "", limit = 68) {
  const safeValue = (value || "Sans titre").trim();
  return safeValue.length > limit ? `${safeValue.slice(0, limit - 1)}…` : safeValue;
}

function getMiniatureThumbnail(link = "") {
  if (!link) return new URL("logo.svg", window.location.href).href;
  const normalized = link.replace(/=s\d+(?:-[a-z])?$/i, "=s800");
  if (/^https?:\/\//i.test(normalized)) return normalized;
  try {
    return new URL(normalized, window.location.href).href;
  } catch {
    return normalized;
  }
}

function getFolderLabel(file = {}) {
  const segments = getFolderSegments(file);
  if (!segments.length) {
    const fallback = (file.folderName || file.folder || "").trim();
    return fallback || "Drive Miniads";
  }
  return segments.join(" / ");
}

function getFolderSegments(file = {}) {
  const raw = (file.folderPath || file.folderName || file.folder || "").trim();
  if (!raw) return [];
  return raw
    .split("/")
    .map(part => part.trim())
    .filter(Boolean);
}

function getFolderGroupLabel(file = {}) {
  const segments = getFolderSegments(file);
  if (!segments.length) {
    const fallback = (file.folderName || file.folder || "").trim();
    return fallback || "Drive Miniads";
  }
  return segments[0];
}

function getSubfolderPathLabel(file = {}) {
  const segments = getFolderSegments(file);
  if (segments.length <= 1) return "";
  return segments.slice(1).join(" / ");
}

const ROOT_SUBFOLDER_KEY = "__ROOT__";

function getFolderAccent(label = "") {
  const palettes = [
    { background: "#fff7ed", accent: "#f59e0b" },
    { background: "#fef2f2", accent: "#ef4444" },
    { background: "#f0f9ff", accent: "#0ea5e9" },
    { background: "#ecfdf5", accent: "#10b981" },
    { background: "#fdf2f8", accent: "#d946ef" },
    { background: "#eef2ff", accent: "#6366f1" },
    { background: "#f5f3ff", accent: "#8b5cf6" }
  ];
  const seed = (label || "folder").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const palette = palettes[seed % palettes.length];
  return palette || palettes[0];
}

function updateMiniaturesGridMode(mode, target = miniaturesGrid) {
  const grid = target || miniaturesGrid;
  if (!grid) return;
  grid.dataset.view = mode;
  grid.classList.toggle("is-gallery", mode === "gallery");
  grid.classList.toggle("is-folders", mode === "folders");
}

function buildSubfolderGroups(files = [], fallbackLabel = "Miniatures principales") {
  const map = new Map();
  files.forEach(file => {
    const subLabel = getSubfolderPathLabel(file);
    const key = subLabel || ROOT_SUBFOLDER_KEY;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(file);
  });
  return Array.from(map.entries()).map(([key, groupFiles]) => {
    const sorted = [...groupFiles].sort(
      (a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)
    );
    const latestTimestamp = sorted.length
      ? new Date(sorted[0].modifiedTime || 0).getTime()
      : 0;
    return {
      key,
      label: key === ROOT_SUBFOLDER_KEY ? fallbackLabel : key,
      displayLabel: key === ROOT_SUBFOLDER_KEY ? "Miniatures principales" : key,
      files: sorted,
      count: sorted.length,
      latestTimestamp
    };
  }).sort((a, b) => {
    if (b.latestTimestamp !== a.latestTimestamp) {
      return b.latestTimestamp - a.latestTimestamp;
    }
    return a.label.localeCompare(b.label, "fr");
  });
}

function createFolderMiniCard(file, parentLabel) {
  const item = document.createElement("div");
  item.className = "folder-mini-card";

  const thumb = document.createElement("div");
  thumb.className = "folder-mini-thumb";
  const img = document.createElement("img");
  img.alt = file.name || "Miniature";
  img.loading = "lazy";
  img.src = getMiniatureThumbnail(file.thumbnailLink);
  thumb.appendChild(img);

  const info = document.createElement("div");
  info.className = "folder-mini-info";
  const title = document.createElement("p");
  title.className = "folder-mini-title";
  title.textContent = truncateText(file.name, 60);
  if (file.name) title.title = file.name;
  const meta = document.createElement("p");
  meta.className = "folder-mini-meta";
  const formatted = formatDate(file.modifiedTime);
  const metaParts = [];
  if (formatted !== "—") metaParts.push(`Modifié le ${formatted}`);
  const folderPathLabel = getFolderLabel(file);
  if (folderPathLabel && folderPathLabel !== parentLabel) {
    metaParts.push(folderPathLabel);
  }
  meta.textContent = metaParts.length ? metaParts.join(" • ") : "Date inconnue";
  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "folder-mini-actions";
  if (file.webViewLink) {
    const openLink = document.createElement("a");
    openLink.className = "mini-card-btn mini-card-btn-primary";
    openLink.href = file.webViewLink;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "Ouvrir";
    actions.appendChild(openLink);
  }
  if (file.webContentLink) {
    const downloadLink = document.createElement("a");
    downloadLink.className = "mini-card-btn";
    downloadLink.href = file.webContentLink;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener";
    downloadLink.textContent = "Télécharger";
    actions.appendChild(downloadLink);
  }

  item.append(thumb, info, actions);
  return item;
}

function closeOtherFolderTiles(currentCard, scope = miniaturesGrid) {
  const grid = scope || miniaturesGrid;
  if (!grid || !currentCard) return;
  const tiles = grid.querySelectorAll(".folder-tile.open");
  tiles.forEach(tile => {
    if (tile === currentCard) return;
    const trigger = tile.querySelector(".folder-tile-body");
    const panelEl = tile.querySelector(".folder-tile-panel");
    if (!trigger || !panelEl) return;
    trigger.setAttribute("aria-expanded", "false");
    tile.classList.remove("open");
    panelEl.hidden = true;
  });
}

function closeSiblingSubfolderCards(container, currentCard) {
  if (!container || !currentCard) return;
  const cards = container.querySelectorAll(".subfolder-card.open");
  cards.forEach(card => {
    if (card === currentCard) return;
    const head = card.querySelector(".subfolder-head");
    const panelEl = card.querySelector(".subfolder-panel");
    if (!head || !panelEl) return;
    head.setAttribute("aria-expanded", "false");
    card.classList.remove("open");
    panelEl.hidden = true;
  });
}

function renderFolderView(files = [], { container = miniaturesGrid, emptyLabel } = {}) {
  const targetGrid = container || miniaturesGrid;
  if (!targetGrid) return;
  updateMiniaturesGridMode("folders", targetGrid);
  targetGrid.innerHTML = "";

  if (!files.length) {
    targetGrid.innerHTML = `<div class="miniatures-empty">${emptyLabel || "Aucun dossier disponible pour l'instant."}</div>`;
    return;
  }

  const groups = files.reduce((acc, file) => {
    const folder = getFolderGroupLabel(file);
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(file);
    return acc;
  }, {});

  const folderList = document.createElement("div");
  folderList.className = "folder-tiles";

  const folders = Object.entries(groups).map(([folderName, folderFiles]) => {
    const sortedFiles = [...folderFiles].sort(
      (a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)
    );
    const latestTimestamp = sortedFiles.length
      ? new Date(sortedFiles[0].modifiedTime || 0).getTime()
      : 0;
    return { folderName, folderFiles, sortedFiles, latestTimestamp };
  });

  folders
    .sort((a, b) => {
      if (b.latestTimestamp !== a.latestTimestamp) return b.latestTimestamp - a.latestTimestamp;
      return a.folderName.localeCompare(b.folderName, "fr");
    })
    .forEach(({ folderName, folderFiles, sortedFiles }) => {
      const card = document.createElement("article");
      card.className = "folder-tile";

      const accents = getFolderAccent(folderName);
      card.style.setProperty("--folder-tile-color", accents.background);
      card.style.setProperty("--folder-tile-accent", accents.accent);

      const latestDate = sortedFiles.length ? formatDate(sortedFiles[0].modifiedTime) : "—";
      const versionCount = folderFiles.length;
      const versionLabel = `${versionCount} miniature${versionCount > 1 ? "s" : ""}`;
      const previewFile = sortedFiles.find(file => file.thumbnailLink);
      const previewMarkup = previewFile
        ? `<img src="${getMiniatureThumbnail(previewFile.thumbnailLink)}" alt="${folderName}" loading="lazy" />`
        : `<span>${(folderName[0] || "D").toUpperCase()}</span>`;
      const subtitle = latestDate !== "—"
        ? `Dernière màj ${latestDate}`
        : "Historique en préparation";

      card.innerHTML = `
        <div class="folder-tile-cover">
          <div class="folder-tile-avatar">${previewMarkup}</div>
        </div>
        <div class="folder-tile-body" role="button" tabindex="0" aria-expanded="false">
          <div class="folder-tile-row">
            <div class="folder-tile-text">
              <h3 class="folder-tile-name">${folderName}</h3>
              <p class="folder-tile-subtitle">${subtitle}</p>
            </div>
            <div class="folder-tile-meta">
              <div class="folder-tile-stat">
                <span class="icon-star" aria-hidden="true"></span>
                <span>${versionLabel}</span>
              </div>
              <span class="folder-tile-caret" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <div class="folder-tile-panel" hidden></div>
      `;

      const panel = card.querySelector(".folder-tile-panel");
      const subfolders = buildSubfolderGroups(sortedFiles, folderName);
      const onlyRootSubfolder = subfolders.length === 1 && subfolders[0].key === ROOT_SUBFOLDER_KEY;
      if (!subfolders.length || onlyRootSubfolder) {
        const grid = document.createElement("div");
        grid.className = "folder-mini-grid";
        sortedFiles.forEach(file => grid.appendChild(createFolderMiniCard(file, folderName)));
        panel.appendChild(grid);
      } else {
        const list = document.createElement("div");
        list.className = "subfolder-list";
        subfolders.forEach(subfolder => {
          const subCard = document.createElement("article");
          subCard.className = "subfolder-card";

          const head = document.createElement("div");
          head.className = "subfolder-head";
          head.setAttribute("role", "button");
          head.setAttribute("tabindex", "0");
          head.setAttribute("aria-expanded", "false");
          const subSubtitle = subfolder.files.length
            ? `Dernière màj ${formatDate(subfolder.files[0].modifiedTime)}`
            : "En attente de miniatures";
          const countLabel = `${subfolder.count} miniature${subfolder.count > 1 ? "s" : ""}`;
          head.innerHTML = `
            <div class="subfolder-head-text">
              <h4>${subfolder.displayLabel}</h4>
              <p>${subSubtitle}</p>
            </div>
            <div class="subfolder-head-meta">
              <span>${countLabel}</span>
              <span class="subfolder-caret" aria-hidden="true"></span>
            </div>
          `;

          const subPanel = document.createElement("div");
          subPanel.className = "subfolder-panel";
          subPanel.hidden = true;
          const grid = document.createElement("div");
          grid.className = "folder-mini-grid";
          subfolder.files.forEach(file => grid.appendChild(createFolderMiniCard(file, subfolder.label)));
          subPanel.appendChild(grid);

          const toggleSubfolder = () => {
            const expanded = head.getAttribute("aria-expanded") === "true";
            if (!expanded) closeSiblingSubfolderCards(list, subCard);
            head.setAttribute("aria-expanded", String(!expanded));
            subCard.classList.toggle("open", !expanded);
            subPanel.hidden = expanded;
          };
          head.addEventListener("click", toggleSubfolder);
          head.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleSubfolder();
            }
          });

          subCard.append(head, subPanel);
          list.appendChild(subCard);
        });
        panel.appendChild(list);
      }

      const trigger = card.querySelector(".folder-tile-body");
      const setState = expand => {
        if (expand) closeOtherFolderTiles(card, targetGrid);
        trigger.setAttribute("aria-expanded", String(expand));
        card.classList.toggle("open", expand);
        panel.hidden = !expand;
      };
      setState(false);
      const togglePanel = () => {
        const isExpanded = trigger.getAttribute("aria-expanded") === "true";
        setState(!isExpanded);
      };
      trigger.addEventListener("click", togglePanel);
      trigger.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          togglePanel();
        }
      });

      folderList.appendChild(card);
    });

  targetGrid.appendChild(folderList);
}
