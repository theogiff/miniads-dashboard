// ===== Overview: Populate Recent Activity from Airtable =====
function populateRecentActivity(rows, titleField, statusField, creatorField, dateField, requestDateField, creationDateField) {
  const list = document.getElementById("recentActivityList");
  if (!list || !rows.length) return;

  const recent = rows.slice(0, 4);
  list.innerHTML = "";

  recent.forEach(r => {
    const title = titleField ? (r[titleField] || "Untitled") : "Untitled";
    const creator = creatorField ? (r[creatorField] || "") : "";
    const status = statusField ? (r[statusField] || "").trim() : "";
    const norm = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // Pick icon/color based on status
    let iconClass = "ov-activity-icon-upload";
    let label = "New Thumbnail";
    let iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

    if (norm.includes("livr") || norm.includes("done") || norm.includes("complete") || norm.includes("termin")) {
      iconClass = "ov-activity-icon-approved";
      label = "Thumbnail Delivered";
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    } else if (norm.includes("en cours") || norm.includes("progress") || norm.includes("revision")) {
      iconClass = "ov-activity-icon-edit";
      label = "In Progress";
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    } else if (norm.includes("feedback") || norm.includes("retour") || norm.includes("modif")) {
      iconClass = "ov-activity-icon-feedback";
      label = "Feedback Received";
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }

    // Date
    const rawDate = r[creationDateField] || r[dateField] || r[requestDateField] || r["created_time"] || "";
    let timeAgo = "";
    if (rawDate) {
      const dt = new Date(rawDate);
      if (!isNaN(dt)) {
        const diffMs = Date.now() - dt.getTime();
        const diffH = Math.floor(diffMs / 3600000);
        const diffD = Math.floor(diffMs / 86400000);
        if (diffH < 1) timeAgo = "Just now";
        else if (diffH < 24) timeAgo = `${diffH}h ago`;
        else if (diffD === 1) timeAgo = "Yesterday";
        else if (diffD < 30) timeAgo = `${diffD} days ago`;
        else timeAgo = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    }

    const item = document.createElement("div");
    item.className = "ov-activity-item";
    item.innerHTML = `
      <div class="ov-activity-icon ${iconClass}">${iconSvg}</div>
      <div class="ov-activity-text">
        <strong>${label}</strong>
        <span>${title}${creator ? ` — ${creator}` : ""}</span>
        ${timeAgo ? `<time>${timeAgo}</time>` : ""}
      </div>
    `;
    list.appendChild(item);
  });
}

// ===== Overview: Populate Recent Work from Google Drive =====
function populateRecentWorkFromDrive(files) {
  const grid = document.getElementById("recentWorkGrid");
  if (!grid || !files || !files.length) return;

  const newRequestCard = document.getElementById("newRequestCard");
  const recent = files.slice(0, 3); // Already sorted by date (most recent first)

  grid.innerHTML = "";

  recent.forEach(file => {
    const card = document.createElement("article");
    card.className = "ov-work-card";

    const thumbSrc = getMiniatureThumbnail(file.thumbnailLink);
    const title = truncateText(file.name || "Sans titre");
    const folder = file.folderName || "";
    const date = formatDate(file.modifiedTime);

    const thumbBtn = document.createElement("button");
    thumbBtn.type = "button";
    thumbBtn.className = "ov-work-thumb";
    thumbBtn.addEventListener("click", () => openMiniaturePip(file));

    const img = document.createElement("img");
    img.src = thumbSrc;
    img.alt = file.name || "Miniature";
    img.loading = "lazy";
    img.onerror = function() {
      this.style.display = "none";
      const ph = document.createElement("div");
      ph.className = "ov-work-thumb-placeholder";
      this.parentElement.appendChild(ph);
    };
    thumbBtn.appendChild(img);

    const info = document.createElement("div");
    info.className = "ov-work-info";
    info.innerHTML = `
      <span class="ov-work-title" title="${file.name || ""}">${title}</span>
      <div class="ov-work-meta">
        <span>${folder}</span>
        <span>${date}</span>
      </div>
    `;

    card.append(thumbBtn, info);
    grid.appendChild(card);
  });

  if (newRequestCard) {
    grid.appendChild(newRequestCard);
  }
}
