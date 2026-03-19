// --- Table rendering and Airtable fetching ---

function renderRows(rows) {
  if (summaryBody) {
    summaryBody.innerHTML = `<tr><td colspan="5" class="empty">En attente de données…</td></tr>`;
  }

  if (!Array.isArray(rows) || !rows.length) {
    if (summaryBody) {
      summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Aucune miniature trouvée avec cette source.</td></tr>`;
    }
    setClientStats({ total: 0, monthly: 0, lastDate: null });
    return;
  }

  const allKeys = collectFieldKeys(rows);
  let imageField = resolveFieldName(allKeys, null, [
    "miniature finale",
    "miniature",
    "miniature (url)",
    "aperçu",
    "apercu",
    "thumbnail",
    "image",
    "preview",
    "cover",
    "visuel",
    "attachment",
    "url",
    "lien miniature",
    "miniature finale url"
  ]);
  let dateField = resolveFieldName(allKeys, null, [
    "date de livraison",
    "livree le",
    "livré le",
    "livre le",
    "date de creation",
    "date de création",
    "date de rendu",
    "date de publication",
    "creation",
    "created at",
    "date",
    "date de creation"
  ]);
  let titleField = resolveFieldName(allKeys, null, [
    "titre",
    "title",
    "titre de la video",
    "video",
    "projet",
    "campaign",
    "task name",
    "titre de la video",
    "titre de la miniature"
  ]);
  let creatorField = resolveFieldName(allKeys, null, [
    "pseudo",
    "createur",
    "créateur",
    "créateurs",
    "créateurs / clients",
    "clients",
    "liste clients",
    "client",
    "brand",
    "chaine",
    "channel",
    "creator",
    "client final"
  ]);
  let quantityField = resolveFieldName(allKeys, null, [
    "nombre de miniatures",
    "nb miniatures",
    "miniatures commandées",
    "nombre de miniatures commandées",
    "nb miniatures commandees",
    "quantite",
    "quantité",
    "count",
    "quantity",
    "volume"
  ]);
  let requestDateField = resolveFieldName(allKeys, null, [
    "date de la demande",
    "demande le",
    "date demande",
    "requested at",
    "request date",
    "created",
    "created time"
  ]);
  let creationDateField = resolveFieldName(allKeys, null, [
    "date de creation",
    "date de création",
    "creation",
    "date de production",
    "date de rendu",
    "production date",
    "created at"
  ]);
  let statusField = resolveFieldName(allKeys, null, [
    "status de la commande",
    "statut de la commande",
    "statut",
    "status",
    "etat",
    "état",
    "state",
    "progression"
  ]);
  if (!imageField) {
    imageField = allKeys.find(key => {
      const value = String(getFirstNonEmptyValue(rows, key) || "").toLowerCase();
      return /^https?:\/\//.test(value) || /\.(png|jpe?g|webp|gif)$/.test(value);
    }) || null;
    if (!imageField) {
      console.warn("Impossible de trouver une colonne Miniature. Colonnes disponibles :", allKeys);
    }
  }

  if (!creatorField) {
    creatorField = allKeys.find(key => {
      const norm = normalizeKey(key);
      if (/miniature|thumb|image|url|http|https|statut|status|date|prix|montant|facture|facturation|quantity|nombre|count/.test(norm)) return false;
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const str = String(value).trim();
      if (!str) return false;
      if (/https?:\/\//i.test(str)) return false;
      if (!isNaN(Number(str))) return false;
      return true;
    }) || null;
  }

  if (!dateField) {
    dateField = allKeys.find(key => {
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const dt = new Date(value);
      return !Number.isNaN(dt.getTime());
    }) || null;
  }

  if (!creationDateField) {
    creationDateField = allKeys.find(key => {
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const dt = new Date(value);
      return !Number.isNaN(dt.getTime());
    }) || null;
  }

  if (!requestDateField) {
    requestDateField = allKeys.find(key => {
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const dt = new Date(value);
      return !Number.isNaN(dt.getTime());
    }) || null;
  }

  if (!quantityField) {
    quantityField = allKeys.find(key => {
      const norm = normalizeKey(key);
      if (!/\b(nombre|nb|quantite|quantité|count|volume|miniature)\b/.test(norm)) return false;
      const value = getFirstNonEmptyValue(rows, key);
      if (!value) return false;
      const num = parseNumber(value);
      return Number.isFinite(num) && num > 0;
    }) || null;
  }

  if (creationDateField && dateField && creationDateField === dateField) {
    creationDateField = null;
  }
  if (creationDateField && requestDateField && creationDateField === requestDateField) {
    creationDateField = null;
  }
  if (requestDateField && dateField && requestDateField === dateField) {
    requestDateField = null;
  }

  const filteredRows = rows;
  const datePriority = [creationDateField, dateField, requestDateField, "created_time"];
  const sortedRows = Array.isArray(filteredRows)
    ? [...filteredRows].sort((a, b) => {
      const dateB = getRowDate(b, datePriority);
      const dateA = getRowDate(a, datePriority);
      const timeB = dateB ? dateB.getTime() : -Infinity;
      const timeA = dateA ? dateA.getTime() : -Infinity;
      if (timeB === timeA) return 0;
      return timeB - timeA;
    })
    : filteredRows;
  const datasetToRender = Array.isArray(sortedRows) ? sortedRows : filteredRows;

  let total = 0;
  let deliveredThisMonth = 0;
  let lastDelivered = null;
  let openOrders = 0;

  datasetToRender.forEach(r => {
    const d = dateField ? r[dateField] : null;
    const qty = quantityField ? parseNumber(r[quantityField]) : 1;
    total += qty;
    if (d && isSameMonth(d)) deliveredThisMonth += qty;
    if (d) {
      const dt = new Date(d);
      if (!Number.isNaN(dt.getTime()) && (!lastDelivered || dt > lastDelivered)) lastDelivered = dt;
    }

    if (document.body.classList.contains("client-mode") && creatorField && !currentClientLabel) {
      const rawCreator = (r[creatorField] || "").trim();
      if (rawCreator) setClientContext(rawCreator);
    }
  });

  setClientStats({
    total,
    monthly: deliveredThisMonth,
    lastDate: lastDelivered
  });

  // Populate Overview: Recent Activity from Airtable rows
  populateRecentActivity(datasetToRender, titleField, statusField, creatorField, dateField, requestDateField, creationDateField);

  if (summaryBody) {
    if (!creatorField && !titleField) {
      summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Colonnes nécessaires introuvables.</td></tr>`;
      updateOpenOrdersDisplay("—");
    } else if (!filteredRows.length) {
      summaryBody.innerHTML = `<tr><td colspan="5" class="empty">Aucune miniature trouvée dans cette source.</td></tr>`;
      updateOpenOrdersDisplay(0);
    } else {
      summaryBody.innerHTML = "";
      datasetToRender.forEach(r => {
        const tr = document.createElement("tr");

        const creatorTd = document.createElement("td");
        creatorTd.textContent = creatorField ? (r[creatorField] || "—") : "—";
        tr.appendChild(creatorTd);

        const titleTd = document.createElement("td");
        titleTd.textContent = titleField ? (r[titleField] || "—") : "—";
        tr.appendChild(titleTd);

        const requestTd = document.createElement("td");
        requestTd.textContent = requestDateField ? formatDate(r[requestDateField]) : "—";
        tr.appendChild(requestTd);

        const creationTd = document.createElement("td");
        creationTd.textContent = creationDateField
          ? formatDate(r[creationDateField])
          : (dateField ? formatDate(r[dateField]) : "—");
        tr.appendChild(creationTd);

        const statusTd = document.createElement("td");
        let normalizedStatus = "";
        if (statusField) {
          const rawStatus = (r[statusField] || "").trim();
          if (rawStatus) {
            normalizedStatus = rawStatus
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
            const chip = document.createElement("span");
            chip.className = "status-chip";
            chip.dataset.status = normalizedStatus || "statut";
            chip.textContent = rawStatus;
            statusTd.appendChild(chip);
          } else {
            statusTd.textContent = "—";
          }
        } else {
          statusTd.textContent = "—";
        }
        tr.appendChild(statusTd);

        summaryBody.appendChild(tr);

        const doneStatuses = ["realisee", "livree", "terminee", "livre", "delivree", "complete", "done"];
        const isDone = normalizedStatus
          ? doneStatuses.some(statusToken => normalizedStatus.includes(statusToken))
          : false;
        if (!isDone) {
          openOrders += 1;
        }
      });
      updateOpenOrdersDisplay(openOrders);
    }
  }
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatDateTime(d) {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isSameMonth(dateA, dateB = new Date()) {
  const a = new Date(dateA);
  if (isNaN(a)) return false;
  return a.getFullYear() === dateB.getFullYear() && a.getMonth() === dateB.getMonth();
}

function openInYoutubeFeed(file = {}, triggerBtn) {
  const thumb = getMiniatureThumbnail(file.thumbnailLink);
  const title = truncateText(file.name || "Votre miniature", 90);
  const channel = getFolderLabel(file);
  const params = new URLSearchParams({
    thumb,
    title,
    channel
  });

  const url = `./miniads-claude/preview.html?${params.toString()}`;
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = "Ouverture…";
  }
  window.open(url, "_blank", "noopener,noreferrer");
  if (triggerBtn) {
    setTimeout(() => {
      triggerBtn.disabled = false;
      triggerBtn.textContent = "Voir sur le feed YouTube";
    }, 800);
  }
}

function setClientStats({ total, monthly, lastDate, loading = false } = {}) {
  const totalValue = loading ? "…" : Number.isFinite(total) ? formatCount(total) : "0";
  const monthlyValue = loading ? "…" : Number.isFinite(monthly) ? formatCount(monthly) : "0";
  const lastValue = loading ? "…" : lastDate ? formatDate(lastDate) : "—";
  if (totalThumbsEl) totalThumbsEl.textContent = totalValue;
  if (deliveredThisMonthEl) deliveredThisMonthEl.textContent = monthlyValue;
  if (monthlyDeliveryValueEl) monthlyDeliveryValueEl.textContent = monthlyValue;
  if (lastDeliveredEl) lastDeliveredEl.textContent = lastValue;
  if (heroLastDeliveryEl) heroLastDeliveryEl.textContent = lastValue;
}

function updateOpenOrdersDisplay(value, { loading = false } = {}) {
  if (!openOrdersEl) return;
  if (loading) {
    openOrdersEl.textContent = "…";
    return;
  }
  if (typeof value === "string") {
    openOrdersEl.textContent = value;
    return;
  }
  if (Number.isFinite(value)) {
    openOrdersEl.textContent = formatCount(Math.max(0, value));
    return;
  }
  openOrdersEl.textContent = "—";
}

function ensureTableInHost(host) {
  if (!host || !tableSection) return;
  if (tableSection.parentElement !== host) {
    host.appendChild(tableSection);
  }
}

function formatFriendlyDate(date = new Date()) {
  try {
    const formatted = date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "long"
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch (err) {
    return formatDate(date);
  }
}

function parseDateValue(value) {
  if (!value) return null;
  const dt = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function getRowDate(row, preferredFields = []) {
  if (!row) return null;
  for (const key of preferredFields) {
    if (!key) continue;
    const candidate = parseDateValue(row[key]);
    if (candidate) return candidate;
  }
  return parseDateValue(row.created_time);
}

async function fetchAirtableRows({ apiKey, baseId, tableId, view, filterByFormula } = {}, options = {}) {
  if (!baseId || !tableId) {
    throw new Error("Identifiants Airtable manquants.");
  }

  const allRows = [];
  const fields = Array.isArray(options.fields) ? options.fields.filter(Boolean) : null;

  const response = await fetch("/api/airtable/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({
      baseId,
      tableId,
      view,
      filterByFormula,
      fields,
      pageSize: 100
    })
  });

  const payloadText = await response.text();
  let payload;
  try {
    payload = payloadText ? JSON.parse(payloadText) : null;
  } catch (err) {
    console.error("Réponse proxy Airtable invalide :", payloadText);
    throw new Error("Réponse Airtable illisible. Vérifie les identifiants.");
  }

  if (!response.ok) {
    const errMsg = payload && payload.error ? payload.error : `${response.status} ${response.statusText}`;
    throw new Error(`Airtable : ${errMsg}`);
  }

  const records = (payload && payload.records) || [];
  records.forEach(record => {
    const fieldsData = record.fields || {};
    const row = {};
    Object.keys(fieldsData).forEach(key => {
      row[key] = flattenAirtableValue(fieldsData[key]);
    });
    if (!row.created_time && record.createdTime) {
      row.created_time = record.createdTime;
    }
    allRows.push(row);
  });

  return allRows;
}
