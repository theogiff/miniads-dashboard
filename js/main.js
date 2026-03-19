// --- Bootstrap / Main entry point ---

const rawModeParam = getParam("mode");
const rawClientParam = getParam("client");
const isAdminRoute = rawModeParam === "admin";
const clientParam = rawClientParam;
const csvParam = null;

ensureTableInHost(clientTableHost);

if (airtableKeyInput && !airtableKeyInput.value && DEFAULT_API_KEY) {
  airtableKeyInput.value = DEFAULT_API_KEY;
}
if (airtableBaseInput && !airtableBaseInput.value && DEFAULT_BASE_ID) {
  airtableBaseInput.value = DEFAULT_BASE_ID;
}
if (airtableTableInput && !airtableTableInput.value && DEFAULT_TABLE_ID) {
  airtableTableInput.value = DEFAULT_TABLE_ID;
}
if (airtableViewInput && !airtableViewInput.value && DEFAULT_VIEW_ID) {
  airtableViewInput.value = DEFAULT_VIEW_ID;
}

// --- Logique principale ---

async function loadAirtable({ apiKey, baseId, tableId, view, filterByFormula } = {}) {
  if (!baseId || !tableId) {
    alert("Renseigne une base et une table Airtable.");
    return;
  }

  setLoadingState();

  try {
    const rows = await fetchAirtableRows({ apiKey, baseId, tableId, view, filterByFormula });
    renderRows(rows);

    // Auto-detect YouTube channel
    if (rows && rows.length && currentClientConfig) {
      const fields = detectAgencyFields(rows);
      if (fields.youtubeField) {
        // Find row for current client
        const clientRow = rows.find(r => {
          if (!fields.creatorField) return true; // if no creator field, take first
          return toSlug(r[fields.creatorField]) === currentClientConfig.slug;
        });

        if (clientRow) {
          const ytUrl = extractFirstUrl(clientRow[fields.youtubeField]);
          if (ytUrl) {
            const input = document.getElementById("youtubeUrlInput");
            const form = document.getElementById("youtubeAnalyzeForm");
            if (input && form && !input.value) {
              input.value = ytUrl;
              setTimeout(() => {
                const submitEvent = new Event("submit");
                form.dispatchEvent(submitEvent);
              }, 800);
            }
          }
        }
      }
    }
  } catch (e) {
    handleLoadError(e);
  }
}

if (isAdminRoute) {
  initAdminFlow();
} else if (clientParam) {
  const clientConfig = applyClientConfig(clientParam);
  if (clientConfig && clientConfig.baseId && clientConfig.tableId) {
    document.body.classList.remove("admin-mode");
    document.body.classList.add("client-mode");
    if (adminLayout) adminLayout.classList.add("admin-hidden");
    if (clientContainer) clientContainer.classList.remove("hidden");
    ensureTableInHost(clientTableHost);
    currentClientConfig = clientConfig;
    setClientContext(clientConfig.label || slugToName(clientParam));
    updateMiniaturesLibrary(clientConfig);
    loadAirtable(clientConfig);
    // Load Drive thumbnails for Overview "Dernières miniatures"
    if (clientParam) {
      displayClientMiniatures(clientParam).catch(err => {
        console.warn("Drive files pour Overview non disponibles:", err.message);
      });
    }
    // Load billing data (pack + order history from Airtable)
    const billingLabel = clientConfig.label || slugToName(clientParam);
    if (billingLabel) {
      loadBillingData(billingLabel);
    }
  } else {
    console.warn(`Aucun client configuré ou clé invalide pour le slug « ${clientParam} ».`);
    document.body.classList.remove("admin-mode");
    document.body.classList.add("client-mode");
    if (adminLayout) adminLayout.classList.add("admin-hidden");
    if (clientContainer) clientContainer.classList.add("hidden");
    updateMiniaturesLibrary(null);
    const existingNotice = document.querySelector(".missing-client-notice");
    if (!existingNotice) {
      const notice = document.createElement("div");
      notice.className = "missing-client-notice";
      notice.innerHTML = `
        <div class="missing-client-card">
          <h2>Accès client requis</h2>
          <p>Utilise le lien personnalisé reçu par email ou WhatsApp pour accéder à ton espace.</p>
        </div>
      `;
      document.body.appendChild(notice);
    }
  }
} else {
  document.body.classList.remove("admin-mode");
  document.body.classList.add("client-mode");
  if (adminLayout) adminLayout.classList.add("admin-hidden");
  if (clientContainer) clientContainer.classList.add("hidden");
  const existingNotice = document.querySelector(".missing-client-notice");
  if (!existingNotice) {
    const notice = document.createElement("div");
    notice.className = "missing-client-notice";
    notice.innerHTML = `
      <div class="missing-client-card">
        <h2>Accès client requis</h2>
        <p>Utilise le lien personnalisé reçu par email ou WhatsApp pour accéder à ton espace.</p>
      </div>
    `;
    document.body.appendChild(notice);
  }
}
