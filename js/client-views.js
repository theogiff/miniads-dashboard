// --- Client view logic ---

function setClientView(view) {
  if (!clientViewSections.length) return;
  const target = view || "dashboard";
  let matchFound = false;
  clientViewSections.forEach(section => {
    if (!section) return;
    const matches = section.dataset.clientView === target;
    section.classList.toggle("active", matches);
    if (matches) matchFound = true;
  });
  if (!matchFound) return;
  clientNavLinks.forEach(link => {
    if (!link) return;
    const viewName = link.dataset.clientView;
    link.classList.toggle("active", viewName === target);
  });
  activeClientView = target;
  if (topbar) {
    topbar.style.display = target === "extension-miniads" ? "none" : "";
  }
  document.body.classList.toggle("extension-active", target === "extension-miniads");
}

function resetClientView() {
  setClientView("dashboard");
}

function configureClientNavigation() {
  if (clientNavLinks.length) {
    clientNavLinks.forEach(link => {
      link.addEventListener("click", () => {
        const targetView = link.dataset.clientView;
        if (!targetView) return;
        setClientView(targetView);
      });
    });
  }
  if (clientScrollLinks.length) {
    clientScrollLinks.forEach(link => {
      link.addEventListener("click", () => {
        const selector = link.dataset.scrollTarget;
        if (!selector) return;
        const target = document.querySelector(selector);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }
  setClientView(activeClientView);
}

function updateMiniaturesLibrary(config) {
  // --- MODE API ---
  // if (MINIADS_API_MODE) {
  //   if (!miniaturesContent || !miniaturesGrid) return;
  //   const url = new URL(window.location.href);
  //   const clientSlug = url.searchParams.get("client") || "";
  //   miniaturesContent.classList.remove("hidden");
  //   miniaturesEmptyState.classList.add("hidden");

  //   if (miniaturesEmbed) miniaturesEmbed.classList.add("miniatures-embed-unavailable");
  //   if (miniaturesDriveFrame) miniaturesDriveFrame.setAttribute("hidden","hidden");
  //   if (miniaturesEmbedHint) miniaturesEmbedHint.classList.add("hidden");
  //   if (miniaturesExternalLink) miniaturesExternalLink.setAttribute("aria-disabled","true");

  //   renderFilesGrid([]);
  //   fetchDriveFilesForClient(clientSlug)
  //     .then(files => renderFilesGrid(files))
  //     .catch(() => {
  //       miniaturesGrid.innerHTML = `<div class="miniatures-empty">Impossible de charger vos miniatures pour le moment.</div>`;
  //     });

  //   return;
  // }
  if (!miniaturesEmptyState || !miniaturesContent) return;
  const folders = config && Array.isArray(config.driveFolders) ? config.driveFolders : [];
  activeDriveFolderIndex = 0;
  if (!folders.length) {
    miniaturesContent.classList.add("hidden");
    miniaturesEmptyState.classList.remove("hidden");
    if (miniaturesFolderList) miniaturesFolderList.innerHTML = "";
    if (miniaturesDriveFrame) {
      miniaturesDriveFrame.src = "about:blank";
      miniaturesDriveFrame.setAttribute("hidden", "hidden");
    }
    if (miniaturesEmbedHint) miniaturesEmbedHint.classList.add("hidden");
    if (miniaturesExternalLink) {
      miniaturesExternalLink.setAttribute("aria-disabled", "true");
      miniaturesExternalLink.removeAttribute("href");
    }
    return;
  }
  miniaturesContent.classList.remove("hidden");
  miniaturesEmptyState.classList.add("hidden");
  renderMiniaturesFolders(folders);
  applyDriveFolderSelection(folders[0], 0);
}

function renderMiniaturesFolders(folders) {
  if (!miniaturesFolderList) return;
  miniaturesFolderList.innerHTML = "";
  folders.forEach((folder, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "miniatures-folder-card";
    if (index === activeDriveFolderIndex) button.classList.add("active");
    const name = document.createElement("span");
    name.className = "miniatures-folder-name";
    name.textContent = folder.label || `Dossier ${index + 1}`;
    button.appendChild(name);
    if (folder.description) {
      const descriptionEl = document.createElement("span");
      descriptionEl.className = "miniatures-folder-description";
      descriptionEl.textContent = folder.description;
      button.appendChild(descriptionEl);
    }
    button.addEventListener("click", () => {
      activeDriveFolderIndex = index;
      applyDriveFolderSelection(folder, index);
    });
    miniaturesFolderList.appendChild(button);
  });
}

function applyDriveFolderSelection(folder, index) {
  if (!folder) return;
  const canEmbed = Boolean(folder.embedUrl && miniaturesDriveFrame);
  if (miniaturesEmbed) {
    miniaturesEmbed.classList.toggle("miniatures-embed-unavailable", !canEmbed);
  }
  if (miniaturesDriveFrame) {
    if (canEmbed) {
      miniaturesDriveFrame.removeAttribute("hidden");
      if (miniaturesDriveFrame.src !== folder.embedUrl) {
        miniaturesDriveFrame.src = folder.embedUrl;
      }
    } else {
      miniaturesDriveFrame.src = "about:blank";
      miniaturesDriveFrame.setAttribute("hidden", "hidden");
    }
  }
  if (miniaturesEmbedHint) {
    miniaturesEmbedHint.classList.toggle("hidden", canEmbed);
  }
  if (miniaturesExternalLink) {
    if (folder.url) {
      miniaturesExternalLink.href = folder.url;
      miniaturesExternalLink.setAttribute("aria-disabled", "false");
    } else {
      miniaturesExternalLink.removeAttribute("href");
      miniaturesExternalLink.setAttribute("aria-disabled", "true");
    }
  }
  if (miniaturesEmbedTitle) {
    miniaturesEmbedTitle.textContent = folder.label || "Dossier Google Drive";
  }
  if (miniaturesEmbedSubtitle) {
    miniaturesEmbedSubtitle.textContent = folder.description || "Centralisation de toutes tes miniatures livrées.";
  }
  if (miniaturesFolderList) {
    Array.from(miniaturesFolderList.children).forEach((card, idx) => {
      card.classList.toggle("active", idx === index);
    });
  }
}

function setClientContext(label = "") {
  if (label !== undefined) {
    currentClientLabel = label;
  }
  const effectiveConfig = currentClientConfig || {};
  const displayName = currentClientLabel || effectiveConfig.label || "";
  if (heroDateEl) {
    heroDateEl.textContent = formatFriendlyDate(new Date());
  }
  if (clientBadge) {
    const nameEl = document.getElementById("topbarName");
    const avatarEl = document.getElementById("topbarAvatar");
    if (displayName) {
      if (nameEl) { nameEl.textContent = displayName; nameEl.classList.remove("hidden"); }
      if (avatarEl) { avatarEl.textContent = displayName.charAt(0).toUpperCase(); }
      clientBadge.classList.remove("hidden");
    } else {
      if (nameEl) { nameEl.textContent = ""; nameEl.classList.add("hidden"); }
      clientBadge.classList.add("hidden");
    }
  }
  if (adminActiveClientEl) {
    adminActiveClientEl.textContent = displayName || "—";
  }
  if (clientTitle) clientTitle.textContent = displayName ? `Espace de ${displayName}` : "Suivi de vos miniatures";
  if (clientGreeting) {
    const container = clientGreeting;
    container.innerHTML = "";
    let lines = [];
    if (effectiveConfig.greeting) {
      if (Array.isArray(effectiveConfig.greeting)) {
        lines = effectiveConfig.greeting.slice();
      } else if (typeof effectiveConfig.greeting === "string") {
        lines = effectiveConfig.greeting.split(/\n+/);
      }
    }
    const cleanedLines = [];
    lines.forEach(line => {
      if (typeof line !== "string") return;
      const trimmed = line.trim();
      if (trimmed) cleanedLines.push(trimmed);
    });
    let finalLines = cleanedLines;
    if (!finalLines.length) {
      const firstLine = displayName
        ? `Hey ${displayName} 👋 ravi de te revoir !`
        : "Bienvenue dans ton espace Miniads 👋";
      finalLines = [
        firstLine,
        "Voici ton espace client, tu y retrouveras tout ton historique de commandes de miniatures."
      ];
    }
    const placeholderName = displayName || "toi";
    finalLines.forEach((line, idx) => {
      const span = document.createElement("span");
      const lineText = typeof line === "string"
        ? line.replace(/\{\{\s*name\s*\}\}|\{name\}|%name%/gi, placeholderName)
        : "";
      span.textContent = lineText;
      container.appendChild(span);
      if (idx < finalLines.length - 1) {
        container.appendChild(document.createElement("br"));
      }
    });
  }
  if (clientInitialsEl) {
    let initials = "M";
    if (displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      if (parts.length) {
        initials = parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join("") || parts[0].charAt(0).toUpperCase();
      }
    }
    clientInitialsEl.textContent = initials || "M";
  }
}

configureClientNavigation();
updateMiniaturesLibrary(currentClientConfig);
