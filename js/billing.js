// ===== Billing: Load pack + order history from Airtable =====

async function loadBillingData(clientLabel) {
  if (!clientLabel) return;

  // 1) Load pack info from Packs table (match on Créateur)
  try {
    const packRes = await fetch("/api/airtable/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        baseId: DEFAULT_BASE_ID,
        tableId: PACKS_TABLE_ID,
        filterByFormula: `{Créateur} = '${clientLabel.replace(/'/g, "\\'")}'`,
        pageSize: 1
      })
    });
    const packData = await packRes.json();
    const packRecord = packData.records?.[0]?.fields;

    const badgeEl = document.getElementById("billPlanBadge");
    const nameEl = document.getElementById("billPlanName");
    const descEl = document.getElementById("billPlanDesc");
    const remainEl = document.getElementById("billRemaining");

    if (packRecord) {
      const pack = packRecord["Pack choisi"] || "standard";
      const remaining = packRecord["Nombre de miniatures restantes"] ?? 0;
      if (badgeEl) badgeEl.textContent = "Pack actuel";
      if (nameEl) nameEl.textContent = `Pack ${pack.charAt(0).toUpperCase() + pack.slice(1)}`;
      if (descEl) descEl.textContent = `Ton pack actuel chez Miniads.`;
      if (remainEl) remainEl.querySelector(".bill-remaining-value").textContent = remaining;
      // Load Tally form based on pack
      loadRequestForm(pack.toLowerCase(), Number(remaining), clientLabel);
    } else {
      if (badgeEl) badgeEl.textContent = "Aucun pack";
      if (nameEl) nameEl.textContent = "—";
      if (descEl) descEl.textContent = "Aucun pack trouvé pour ce compte.";
      if (remainEl) remainEl.querySelector(".bill-remaining-value").textContent = "—";
      loadRequestForm(null, 0, clientLabel);
    }
  } catch (e) {
    console.warn("Erreur chargement pack Airtable:", e);
  }

  // 1b) Load client info (email, nom) from Clients table (match on Pseudo)
  try {
    const clientRes = await fetch("/api/airtable/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        baseId: DEFAULT_BASE_ID,
        tableId: CLIENTS_TABLE_ID,
        filterByFormula: `{Pseudo} = '${clientLabel.replace(/'/g, "\\'")}'`,
        pageSize: 1
      })
    });
    const clientData = await clientRes.json();
    const clientRecord = clientData.records?.[0]?.fields;
    if (clientRecord) {
      const descEl = document.getElementById("billPlanDesc");
      const email = clientRecord["Email"] || "";
      const nom = [clientRecord["Prénom"], clientRecord["Nom"]].filter(Boolean).join(" ");
      if (descEl && (nom || email)) {
        descEl.textContent = [nom, email].filter(Boolean).join(" — ");
      }
    }
  } catch (e) {
    console.warn("Erreur chargement client Airtable:", e);
  }

  // 2) Load order history from main table (filtered by client)
  try {
    const ordersRes = await fetch("/api/airtable/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        baseId: DEFAULT_BASE_ID,
        tableId: DEFAULT_TABLE_ID,
        filterByFormula: `{Créateurs} = '${clientLabel.replace(/'/g, "\\'")}'`,
        pageSize: 100
      })
    });
    const ordersData = await ordersRes.json();
    const rows = (ordersData.records || []).map(r => r.fields).filter(Boolean);

    const tbody = document.getElementById("billingTableBody");
    const emptyEl = document.getElementById("billingEmpty");
    if (!tbody) return;

    if (!rows.length) {
      if (emptyEl) emptyEl.textContent = "Aucune commande trouvée.";
      return;
    }

    // Sort by date desc
    rows.sort((a, b) => {
      const da = new Date(a["Date de création"] || a["Date de la demande"] || 0);
      const db = new Date(b["Date de création"] || b["Date de la demande"] || 0);
      return db - da;
    });

    tbody.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const title = r["Titre de la vidéo"] || "—";
      const date = formatDate(r["Date de création"] || r["Date de la demande"]);
      const prix = r["Prix"] ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(r["Prix"]) : "—";
      const facturation = r["Facturation"] || "—";

      const factClass = facturation.toLowerCase().includes("factur") ? "status-paid" : "";
      tr.innerHTML = `
        <td>${title}</td>
        <td>${date}</td>
        <td><strong>${prix}</strong></td>
        <td><span class="status-chip" data-status="${factClass}">${facturation}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.warn("Erreur chargement commandes Airtable:", e);
    const emptyEl = document.getElementById("billingEmpty");
    if (emptyEl) emptyEl.textContent = "Erreur de chargement.";
  }

  // 3) Populate request history table from orders
  try {
    const reqBody = document.getElementById("requestsTableBody");
    if (reqBody && clientLabel) {
      const reqRes = await fetch("/api/airtable/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          baseId: DEFAULT_BASE_ID,
          tableId: DEFAULT_TABLE_ID,
          filterByFormula: `{Créateurs} = '${clientLabel.replace(/'/g, "\\'")}'`,
          pageSize: 100
        })
      });
      const reqData = await reqRes.json();
      const reqRows = (reqData.records || []).map(r => r.fields).filter(Boolean);
      reqRows.sort((a, b) => {
        const da = new Date(a["Date de la demande"] || a["Date de création"] || 0);
        const db = new Date(b["Date de la demande"] || b["Date de création"] || 0);
        return db - da;
      });

      if (reqRows.length) {
        reqBody.innerHTML = "";
        reqRows.forEach(r => {
          const tr = document.createElement("tr");
          const title = r["Titre de la vidéo"] || "—";
          const creator = r["Créateurs"] || "—";
          const date = formatDate(r["Date de la demande"] || r["Date de création"]);
          const status = r["Status de la commande"] || "—";
          const norm = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
          tr.innerHTML = `
            <td>${title}</td>
            <td>${creator}</td>
            <td>${date}</td>
            <td><span class="status-chip" data-status="${norm}">${status}</span></td>
          `;
          reqBody.appendChild(tr);
        });
      }
    }
  } catch (e) {
    console.warn("Erreur chargement historique demandes:", e);
  }
}

// ===== Requests: Load Tally form based on pack =====
const TALLY_BASE_URL = "https://tally.so/r/mDvdDE";

// Tally field IDs for pre-fill (from API)
const TALLY_FIELDS = {
  pseudo: "5bYYNN"  // "Ton pseudo / Prénom"
};

function loadRequestForm(packName, remaining, clientLabel) {
  const container = document.getElementById("requestFormContainer");
  if (!container) return;

  // No pack or 0 remaining
  if (!packName || remaining <= 0) {
    container.innerHTML = `
      <div class="req-no-pack">
        <div class="req-no-pack-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        </div>
        <h3>${!packName ? "Aucun pack actif" : "Plus de miniatures disponibles"}</h3>
        <p>${!packName ? "Tu n'as pas encore de pack Miniads. Commande ton premier pack pour commencer." : "Tu as utilisé toutes les miniatures de ton pack. Renouvelle ou upgrade ton pack."}</p>
        <a href="https://miniads.fr" target="_blank" rel="noopener" class="btn-primary-sm">Commander une nouvelle miniature</a>
      </div>
    `;
    return;
  }

  // Determine pack param
  const normalizedPack = packName.toLowerCase();
  let packParam = "standard";
  if (normalizedPack.includes("10") || normalizedPack.includes("premium") || normalizedPack.includes("pro")) {
    packParam = "premium";
  }

  // Build URL with pre-fill
  const params = new URLSearchParams({
    pack: packParam,
    transparentBackground: "1"
  });
  // Pre-fill pseudo field
  if (clientLabel) {
    params.set(TALLY_FIELDS.pseudo, clientLabel);
  }

  container.innerHTML = `
    <div class="req-tally-embed">
      <iframe
        data-tally-src="${TALLY_BASE_URL}?${params.toString()}"
        loading="lazy"
        title="Formulaire de demande Miniads"
        frameborder="0"
        marginheight="0"
        marginwidth="0"
      ></iframe>
    </div>
  `;

  // Load Tally embed script for auto-resize
  const iframe = container.querySelector("iframe");
  if (iframe) {
    iframe.src = `${TALLY_BASE_URL}?${params.toString()}`;
    // Listen for Tally resize messages
    window.addEventListener("message", function tallyResize(e) {
      if (e.data && typeof e.data === "object" && e.data["tally.formLoaded"]) {
        iframe.style.minHeight = "0";
      }
      if (e.data && typeof e.data === "object" && e.data["tally.formPageChanged"]) {
        iframe.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (e.data && typeof e.data === "string") {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.event === "Tally.FormLoaded" || parsed.event === "Tally.FormPageChanged") {
            if (parsed.payload && parsed.payload.height) {
              iframe.style.height = parsed.payload.height + "px";
            }
          }
        } catch (_) {}
      }
    });
  }

  // Load submission history from Tally API
  loadTallySubmissions(clientLabel);
}

// ===== Requests: Load submissions history from Tally API =====
async function loadTallySubmissions(clientLabel) {
  const tbody = document.getElementById("requestsTableBody");
  if (!tbody || !clientLabel) return;

  try {
    const res = await fetch("/api/tally/submissions?limit=50");
    const data = await res.json();
    if (!res.ok || !data.submissions) {
      console.warn("Tally submissions error:", data.error || "No data");
      return;
    }

    // Map question IDs to titles for lookup
    const questionMap = {};
    (data.questions || []).forEach(q => {
      (q.fields || []).forEach(f => {
        questionMap[f.uuid] = q.title || f.title || "";
      });
    });

    // Filter submissions by client pseudo
    const clientNorm = clientLabel.toLowerCase().trim();
    const clientSubmissions = data.submissions.filter(sub => {
      const responses = sub.responses || [];
      return responses.some(r => {
        const qTitle = questionMap[r.questionId] || "";
        if (qTitle.toLowerCase().includes("pseudo") || qTitle.toLowerCase().includes("prénom")) {
          return String(r.answer || "").toLowerCase().trim() === clientNorm;
        }
        return false;
      });
    });

    if (!clientSubmissions.length) return; // Keep Airtable data as fallback

    tbody.innerHTML = "";
    clientSubmissions.forEach(sub => {
      const responses = sub.responses || [];
      const getAnswer = (keyword) => {
        const resp = responses.find(r => {
          const qTitle = questionMap[r.questionId] || "";
          return qTitle.toLowerCase().includes(keyword);
        });
        return resp ? String(resp.answer || "") : "—";
      };

      const titre = getAnswer("titre de la vidéo") || "—";
      const date = sub.submittedAt
        ? new Date(sub.submittedAt).toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" })
        : "—";
      const description = getAnswer("description") || "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${titre}</td>
        <td title="${description}">${clientLabel}</td>
        <td>${date}</td>
        <td><span class="status-chip" data-status="realisee">Soumise</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.warn("Erreur chargement soumissions Tally:", e);
    // Fallback: keep Airtable data already loaded
  }
}
