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
      const pack = packRecord["Pack choisi"] || "Standard";
      const remaining = packRecord["Nombre de miniatures restantes"] ?? "—";
      if (badgeEl) badgeEl.textContent = "Pack actuel";
      if (nameEl) nameEl.textContent = `Pack ${pack.charAt(0).toUpperCase() + pack.slice(1)}`;
      if (descEl) descEl.textContent = `Ton pack actuel chez Miniads.`;
      if (remainEl) remainEl.querySelector(".bill-remaining-value").textContent = remaining;
    } else {
      if (badgeEl) badgeEl.textContent = "Aucun pack";
      if (nameEl) nameEl.textContent = "—";
      if (descEl) descEl.textContent = "Aucun pack trouvé pour ce compte.";
      if (remainEl) remainEl.querySelector(".bill-remaining-value").textContent = "—";
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
}
