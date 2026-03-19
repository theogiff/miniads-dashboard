// --- Admin / Agency Dashboard ---

const agencyState = {
  rawRows: [],
  normalized: [],
  fieldMap: {},
  firstOrderByClient: new Map(),
  charts: {
    revenue: null,
    clients: null,
    ratio: null,
    retention: null
  },
  filter: {
    preset: "12m",
    start: null,
    end: null
  },
  global: {
    totalRevenue: 0,
    totalOrders: 0,
    totalQuantity: 0,
    revenueByClient: new Map(),
    ordersByClient: new Map(),
    quantityByClient: new Map(),
    timelineByClient: new Map()
  }
};
let agencyInitialized = false;
let agencyLoading = false;

let chartThemeConfigured = false;
function configureChartsTheme() {
  if (chartThemeConfigured || typeof Chart === "undefined") return;
  chartThemeConfigured = true;
}

configureChartsTheme();

function formatCurrency(value, options = {}) {
  if (!Number.isFinite(value)) return "—";
  const defaults = { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 };
  return value.toLocaleString("fr-FR", { ...defaults, ...options });
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })}%`;
}

const TREND_VISUALS = {
  positive: { text: "#1f9d5c", bar: "rgba(31,157,92,0.7)", line: "#1f9d5c", fill: "rgba(31,157,92,0.18)" },
  neutral: { text: "#d97706", bar: "rgba(245,154,45,0.75)", line: "#d97706", fill: "rgba(245,154,45,0.2)" },
  negative: { text: "#d04050", bar: "rgba(208,64,80,0.72)", line: "#d04050", fill: "rgba(208,64,80,0.18)" },
  na: { text: "#6e7695", bar: "rgba(57,66,98,0.28)", line: "#394262", fill: "rgba(57,66,98,0.12)" }
};

function computeDeltaPercent(currentValue, previousValue) {
  if (previousValue === null || previousValue === undefined) return null;
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current)) {
    if (current === 0) {
      return previous === 0 ? 0 : null;
    }
    return null;
  }
  if (!Number.isFinite(previous)) {
    if (previous === 0) {
      return current === 0 ? 0 : (current > 0 ? Infinity : -Infinity);
    }
    return null;
  }
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? Infinity : current < 0 ? -Infinity : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function resolveTrend(delta) {
  if (delta === null || delta === undefined) return null;
  if (!Number.isFinite(delta)) {
    if (delta === Infinity) return "positive";
    if (delta === -Infinity) return "negative";
    return "neutral";
  }
  if (delta >= 3) return "positive";
  if (delta <= -3) return "negative";
  return "neutral";
}

function formatDeltaPercent(delta) {
  if (delta === null || delta === undefined) return "—";
  if (!Number.isFinite(delta)) {
    if (delta === Infinity) return "+∞%";
    if (delta === -Infinity) return "-∞%";
    return "0%";
  }
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`;
}

function resetTrendIndicator(element, message = "—") {
  if (!element) return;
  element.classList.remove("trend-positive", "trend-neutral", "trend-negative", "trend-na");
  element.classList.add("trend-na");
  element.innerHTML = `<span class="trend-arrow">—</span><span class="trend-text">${message}</span>`;
}

function applyTrendClass(element, trend) {
  if (!element) return;
  element.classList.remove("trend-positive", "trend-neutral", "trend-negative", "trend-na");
  if (!trend) {
    element.classList.add("trend-na");
    return;
  }
  element.classList.add(`trend-${trend}`);
}

function applyTrendIndicator(element, currentValue, previousValue, { suffix = "vs période précédente", previousFormatter } = {}) {
  if (!element) return { trend: null, delta: null };
  element.classList.remove("trend-positive", "trend-neutral", "trend-negative", "trend-na");
  const hasPrevious = previousValue !== null && previousValue !== undefined;
  if (!hasPrevious) {
    resetTrendIndicator(element, "Pas de comparaison");
    return { trend: null, delta: null };
  }
  const delta = computeDeltaPercent(currentValue, previousValue);
  if (delta === null) {
    resetTrendIndicator(element, "Pas de comparaison");
    return { trend: null, delta: null };
  }
  const trend = resolveTrend(delta);
  const arrow = trend === "positive" ? "▲" : trend === "negative" ? "▼" : "►";
  const formattedDelta = formatDeltaPercent(delta);
  let text = `${formattedDelta} ${suffix}`.trim();
  if (typeof previousFormatter === "function") {
    const formattedPrevious = previousFormatter(previousValue);
    if (formattedPrevious) {
      text += ` (vs ${formattedPrevious})`;
    }
  }
  element.innerHTML = `<span class="trend-arrow">${arrow}</span><span class="trend-text">${text}</span>`;
  if (trend) {
    element.classList.add(`trend-${trend}`);
  } else {
    element.classList.add("trend-na");
  }
  return { trend, delta };
}

function getTrendVisual(trend) {
  return TREND_VISUALS[trend] || TREND_VISUALS.na;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function computeActivePeriod(filter = agencyState.filter) {
  const now = new Date();
  const end = filter.end ? endOfDay(filter.end) : endOfDay(now);
  let start = filter.start ? startOfDay(filter.start) : null;
  let label = "Toutes les périodes";

  switch (filter.preset) {
    case "30d": {
      start = start || startOfDay(new Date(end));
      start.setDate(start.getDate() - 29);
      label = "Vue sur les 30 derniers jours";
      break;
    }
    case "6m": {
      const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
      start = start || startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 5, 1));
      label = "Vue sur les 6 derniers mois";
      break;
    }
    case "12m": {
      const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
      start = start || startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1));
      label = "Vue sur les 12 derniers mois";
      break;
    }
    case "custom": {
      if (!start) start = startOfDay(new Date(end.getFullYear(), end.getMonth(), 1));
      label = `Du ${formatDate(start)} au ${formatDate(end)}`;
      break;
    }
    default: {
      const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
      start = start || startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1));
      label = "Vue globale (12 mois par défaut)";
    }
  }

  return { start, end, label };
}

function computePreviousPeriodRange(currentStart, currentEnd) {
  if (!currentStart || !currentEnd) return null;
  const startTime = currentStart.getTime();
  const endTime = currentEnd.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  const duration = Math.max(0, endTime - startTime);
  const previousEnd = endOfDay(new Date(startTime - 1));
  const previousStart = startOfDay(new Date(previousEnd.getTime() - duration));
  return { start: previousStart, end: previousEnd };
}

function computeRangeMetrics(rangeStart, rangeEnd) {
  const startTime = rangeStart ? rangeStart.getTime() : Number.NEGATIVE_INFINITY;
  const endTime = rangeEnd ? rangeEnd.getTime() : Number.POSITIVE_INFINITY;
  const filtered = Array.isArray(agencyState.normalized)
    ? agencyState.normalized.filter(entry => entry.time >= startTime && entry.time <= endTime)
    : [];

  let totalRevenue = 0;
  let totalQuantity = 0;
  let totalOrders = 0;
  let returningRevenue = 0;
  const activeClients = new Set();
  const returningClients = new Set();
  const startBoundary = Number.isFinite(startTime) ? startTime : Number.NEGATIVE_INFINITY;
  const endBoundary = Number.isFinite(endTime) ? endTime : Number.POSITIVE_INFINITY;

  filtered.forEach(entry => {
    const revenue = Number.isFinite(entry.revenue) ? entry.revenue : 0;
    const quantity = Number.isFinite(entry.quantity) ? entry.quantity : 0;
    totalRevenue += revenue;
    totalQuantity += quantity;
    totalOrders += 1;
    if (entry.client) {
      activeClients.add(entry.client);
      const firstDate = agencyState.firstOrderByClient.get(entry.client);
      if (firstDate && firstDate.getTime() < startBoundary) {
        returningRevenue += revenue;
        returningClients.add(entry.client);
      }
    }
  });

  let newClientsCount = 0;
  activeClients.forEach(client => {
    const firstDate = agencyState.firstOrderByClient.get(client);
    if (!firstDate) return;
    const firstTime = firstDate.getTime();
    if (firstTime >= startBoundary && firstTime <= endBoundary) {
      newClientsCount += 1;
    }
  });

  const activeClientsCount = activeClients.size;
  const totalKnownClients = agencyState.firstOrderByClient ? agencyState.firstOrderByClient.size : activeClientsCount;
  const averageBasket = totalOrders ? totalRevenue / totalOrders : 0;
  const newClientsRate = activeClientsCount ? (newClientsCount / activeClientsCount) * 100 : 0;
  const activeRate = totalKnownClients ? (activeClientsCount / totalKnownClients) * 100 : 0;
  const returningRevenueShare = totalRevenue > 0 ? (returningRevenue / totalRevenue) * 100 : 0;
  const ordersPerClientRange = activeClientsCount ? totalOrders / activeClientsCount : 0;
  const cltvRange = activeClientsCount ? totalRevenue / activeClientsCount : 0;

  return {
    start: rangeStart,
    end: rangeEnd,
    filtered,
    revenue: totalRevenue,
    quantity: totalQuantity,
    orders: totalOrders,
    activeClientsCount,
    totalKnownClients,
    newClientsCount,
    newClientsRate,
    averageBasket,
    activeRate,
    returningRevenueShare,
    returningRevenue,
    returningClients: returningClients.size,
    ordersPerClientRange,
    cltvRange
  };
}

function computeLifetimeMetricsUpTo(endDate) {
  const limit = endDate instanceof Date ? endDate.getTime() : Number.POSITIVE_INFINITY;
  let revenueSum = 0;
  let ordersSum = 0;
  const clientSet = new Set();

  if (Array.isArray(agencyState.normalized)) {
    agencyState.normalized.forEach(entry => {
      if (entry.time <= limit) {
        revenueSum += Number.isFinite(entry.revenue) ? entry.revenue : 0;
        ordersSum += 1;
        if (entry.client) clientSet.add(entry.client);
      }
    });
  }

  const clientCount = clientSet.size;
  return {
    ordersPerClient: clientCount ? ordersSum / clientCount : 0,
    cltv: clientCount ? revenueSum / clientCount : 0,
    clientCount
  };
}

function updateChartTrendStyles({ revenueTrend, clientsTrend, ratioTrend, retentionTrend }) {
  applyTrendClass(adminRevenueChartStatus, revenueTrend);
  applyTrendClass(adminClientsChartStatus, clientsTrend);
  applyTrendClass(adminRatioChartStatus, ratioTrend);
  applyTrendClass(adminRetentionChartStatus, retentionTrend);

  const revenueChart = agencyState.charts && agencyState.charts.revenue;
  if (revenueChart) {
    const colors = getTrendVisual(revenueTrend);
    if (revenueChart.data.datasets[0]) {
      revenueChart.data.datasets[0].backgroundColor = colors.bar;
      revenueChart.data.datasets[0].borderColor = colors.line;
    }
    if (revenueChart.data.datasets[1]) {
      revenueChart.data.datasets[1].borderColor = colors.line;
      revenueChart.data.datasets[1].backgroundColor = colors.fill;
    }
    revenueChart.update();
  }

  const clientsChart = agencyState.charts && agencyState.charts.clients;
  if (clientsChart && clientsChart.data.datasets[0]) {
    const colors = getTrendVisual(clientsTrend);
    const dataset = clientsChart.data.datasets[0];
    dataset.borderColor = colors.line;
    dataset.backgroundColor = colors.fill;
    dataset.pointBackgroundColor = colors.line;
    dataset.pointHoverBackgroundColor = colors.line;
    clientsChart.update();
  }

  const ratioChart = agencyState.charts && agencyState.charts.ratio;
  if (ratioChart && ratioChart.data.datasets[0]) {
    const colors = getTrendVisual(ratioTrend);
    const dataset = ratioChart.data.datasets[0];
    dataset.backgroundColor = [colors.bar, "rgba(30,31,36,0.15)"];
    ratioChart.update();
  }
}

function updateInsightsView(currentMetrics, previousMetrics) {
  if (!insightsReturningValue || !insightsReturningDelta || !insightsAverageBasketValue || !insightsActiveRateValue || !insightsNewClientsValue) {
    return;
  }

  const hasData = currentMetrics && Array.isArray(currentMetrics.filtered) && currentMetrics.filtered.length > 0;
  if (!hasData) {
    insightsReturningValue.textContent = "—";
    insightsAverageBasketValue.textContent = "—";
    insightsActiveRateValue.textContent = "—";
    insightsNewClientsValue.textContent = "—";
    if (insightsNewClientsMeta) insightsNewClientsMeta.textContent = "(vs —)";
    resetTrendIndicator(insightsReturningDelta, "Pas de données");
    resetTrendIndicator(insightsAverageBasketDelta, "Pas de données");
    resetTrendIndicator(insightsActiveRateDelta, "Pas de données");
    resetTrendIndicator(insightsNewClientsDelta, "Pas de données");
    return;
  }

  const previousMetricsSafe = previousMetrics || null;
  insightsReturningValue.textContent = formatPercent(currentMetrics.returningRevenueShare, 1);
  applyTrendIndicator(
    insightsReturningDelta,
    currentMetrics.returningRevenueShare,
    previousMetricsSafe ? previousMetricsSafe.returningRevenueShare : null
  );

  insightsAverageBasketValue.textContent = formatCurrency(currentMetrics.averageBasket, { maximumFractionDigits: 2 });
  applyTrendIndicator(
    insightsAverageBasketDelta,
    currentMetrics.averageBasket,
    previousMetricsSafe ? previousMetricsSafe.averageBasket : null
  );

  insightsActiveRateValue.textContent = formatPercent(currentMetrics.activeRate, 1);
  applyTrendIndicator(
    insightsActiveRateDelta,
    currentMetrics.activeRate,
    previousMetricsSafe ? previousMetricsSafe.activeRate : null
  );

  const previousNewClients = previousMetricsSafe ? previousMetricsSafe.newClientsCount : null;
  insightsNewClientsValue.textContent = formatCount(currentMetrics.newClientsCount);
  if (insightsNewClientsMeta) {
    insightsNewClientsMeta.textContent = previousNewClients !== null && previousNewClients !== undefined
      ? `(vs ${formatCount(previousNewClients)})`
      : "(vs —)";
  }
  applyTrendIndicator(
    insightsNewClientsDelta,
    currentMetrics.newClientsCount,
    previousNewClients,
    { previousFormatter: value => formatCount(value) }
  );
}

function updateFilterButtonsUI() {
  if (!adminFilterButtons.length) return;
  const activePreset = agencyState.filter.preset;
  adminFilterButtons.forEach(button => {
    const preset = button.dataset.adminRange;
    button.classList.toggle("active", preset === activePreset);
  });
}

function setDashboardPreset(preset) {
  if (!preset) return;
  agencyState.filter.preset = preset;
  if (preset !== "custom") {
    agencyState.filter.start = null;
    agencyState.filter.end = null;
    if (adminStartInput) adminStartInput.value = "";
    if (adminEndInput) adminEndInput.value = "";
  }
  updateFilterButtonsUI();
  updateAdminDashboard();
}

function applyCustomDateRange() {
  if (!adminStartInput || !adminEndInput) return;
  const startValue = adminStartInput.value ? new Date(adminStartInput.value) : null;
  const endValue = adminEndInput.value ? new Date(adminEndInput.value) : null;
  if (startValue && endValue && startValue.getTime() > endValue.getTime()) {
    alert("La date de début doit précéder la date de fin.");
    return;
  }
  agencyState.filter.preset = "custom";
  agencyState.filter.start = startValue ? startOfDay(startValue) : null;
  agencyState.filter.end = endValue ? endOfDay(endValue) : null;
  updateFilterButtonsUI();
  updateAdminDashboard();
}

function displayDashboardEmptyState(show) {
  if (adminDashboardEmpty) {
    adminDashboardEmpty.classList.toggle("hidden", !show);
  }
}

function resolveMonthlyThumbsLabel(preset = "") {
  switch (preset) {
    case "30d":
      return "Miniatures — 30 derniers jours";
    case "6m":
      return "Miniatures — 6 derniers mois";
    case "12m":
      return "Miniatures — 12 derniers mois";
    case "custom":
      return "Miniatures — période sélectionnée";
    default:
      return "Miniatures — période";
  }
}

const monthLabelFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

function formatMonthLabel(date) {
  return monthLabelFormatter.format(date);
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthlyTimeline(start, end) {
  const buckets = [];
  if (!start || !end) return buckets;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor.getTime() <= limit.getTime()) {
    buckets.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

function computeMovingAverage(values, windowSize = 3) {
  return values.map((value, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const subset = values.slice(start, index + 1).filter(v => Number.isFinite(v));
    if (!subset.length) return null;
    const sum = subset.reduce((acc, current) => acc + current, 0);
    return sum / subset.length;
  });
}

function isLikelyNumericColumn(rows, field) {
  if (!field) return false;
  const sample = getFirstNonEmptyValue(rows, field);
  if (sample === undefined || sample === null || sample === "") return false;
  const num = parseNumber(sample);
  return Number.isFinite(num);
}

function detectAgencyFields(rows) {
  if (!Array.isArray(rows) || !rows.length) return {};
  const allKeys = collectFieldKeys(rows);

  const creatorField = resolveFieldName(allKeys, DEFAULT_PSEUDO_FIELD, [
    DEFAULT_PSEUDO_FIELD,
    "pseudo",
    "client",
    "client final",
    "créateur",
    "créateurs",
    "clients",
    "chaine",
    "channel",
    "brand",
    "creator"
  ]);

  const dateField = resolveFieldName(allKeys, null, [
    "date de livraison",
    "date de création",
    "date de rendu",
    "date",
    "created at",
    "creation",
    "livré le",
    "livraison",
    "deadline"
  ]);

  const requestDateField = resolveFieldName(allKeys, null, [
    "date de la demande",
    "demande le",
    "request date",
    "created",
    "created time"
  ]);

  const creationDateField = resolveFieldName(allKeys, null, [
    "date de création",
    "date de production",
    "créé le",
    "production date",
    "created at"
  ]);

  let revenueField = resolveFieldName(allKeys, null, [
    "montant",
    "montant ht",
    "montant ttc",
    "total",
    "total ttc",
    "total ht",
    "chiffre d'affaires",
    "ca",
    "tarif",
    "prix",
    "amount",
    "revenue",
    "budget",
    "facture",
    "paiement",
    "fees",
    "sales"
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

  let youtubeField = resolveFieldName(allKeys, null, [
    "chaine youtube",
    "chaine",
    "channel",
    "youtube",
    "lien youtube",
    "channel url",
    "youtube link",
    "url",
    "lien"
  ]);

  if (revenueField && !isLikelyNumericColumn(rows, revenueField)) {
    revenueField = null;
  }

  if (!revenueField) {
    const fallback = allKeys.find(key => {
      if (key === quantityField) return false;
      const norm = normalizeKey(key);
      if (/date|client|statut|status|titre|title|nom|description|commentaire|note|status|phase|lien|url|youtube/.test(norm)) {
        return false;
      }
      return isLikelyNumericColumn(rows, key);
    });
    if (fallback) revenueField = fallback;
  }

  return {
    creatorField,
    dateField,
    requestDateField,
    creationDateField,
    revenueField,
    quantityField,
    youtubeField
  };
}

function selectBestDate(row, fields) {
  if (!row || !fields) return null;
  const sources = [fields.creationDateField, fields.dateField, fields.requestDateField, "created_time"];
  for (const source of sources) {
    if (!source || !row[source]) continue;
    const dt = parseDateValue(row[source]);
    if (dt) return dt;
  }
  return null;
}

function prepareAgencyDataset(rows) {
  agencyState.rawRows = Array.isArray(rows) ? rows.slice() : [];
  agencyState.fieldMap = detectAgencyFields(rows);
  agencyState.normalized = [];
  agencyState.firstOrderByClient = new Map();
  agencyState.global = {
    totalRevenue: 0,
    totalOrders: 0,
    totalQuantity: 0,
    revenueByClient: new Map(),
    ordersByClient: new Map(),
    quantityByClient: new Map(),
    timelineByClient: new Map()
  };

  if (!Array.isArray(rows) || !rows.length) {
    updateAdminDashboard();
    return;
  }

  if (!agencyState.fieldMap.revenueField) {
    console.warn("Aucune colonne Montant détectée : le chiffre d'affaires sera considéré comme égal à 0.");
  }
  if (!agencyState.fieldMap.dateField && !agencyState.fieldMap.creationDateField && !agencyState.fieldMap.requestDateField) {
    console.warn("Aucune colonne Date détectée pour les indicateurs.");
  }

  const normalized = [];
  rows.forEach(row => {
    const date = selectBestDate(row, agencyState.fieldMap);
    if (!date) return;
    const client = agencyState.fieldMap.creatorField ? String(row[agencyState.fieldMap.creatorField] || "").trim() : "";
    const revenue = agencyState.fieldMap.revenueField ? parseNumber(row[agencyState.fieldMap.revenueField]) : 0;
    const quantityRaw = agencyState.fieldMap.quantityField ? parseNumber(row[agencyState.fieldMap.quantityField]) : 1;
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.max(1, Math.round(quantityRaw)) : 1;
    const safeRevenue = Number.isFinite(revenue) ? revenue : 0;
    normalized.push({
      row,
      client,
      date,
      time: date.getTime(),
      revenue: safeRevenue,
      quantity
    });
    if (client) {
      const prevRevenue = agencyState.global.revenueByClient.get(client) || 0;
      agencyState.global.revenueByClient.set(client, prevRevenue + safeRevenue);
      const prevOrders = agencyState.global.ordersByClient.get(client) || 0;
      agencyState.global.ordersByClient.set(client, prevOrders + 1);
      const prevQuantity = agencyState.global.quantityByClient.get(client) || 0;
      agencyState.global.quantityByClient.set(client, prevQuantity + quantity);
      const timeline = agencyState.global.timelineByClient.get(client) || [];
      timeline.push(date);
      agencyState.global.timelineByClient.set(client, timeline);
    }
    agencyState.global.totalRevenue += safeRevenue;
    agencyState.global.totalQuantity += quantity;
    agencyState.global.totalOrders += 1;
  });

  normalized.sort((a, b) => a.time - b.time);
  agencyState.global.timelineByClient.forEach(list => list.sort((a, b) => a.getTime() - b.getTime()));
  agencyState.normalized = normalized;

  normalized.forEach(entry => {
    if (!entry.client) return;
    const existing = agencyState.firstOrderByClient.get(entry.client);
    if (!existing || entry.time < existing.getTime()) {
      agencyState.firstOrderByClient.set(entry.client, entry.date);
    }
  });

  agencyState.totals = {
    uniqueClients: agencyState.firstOrderByClient.size
  };

  updateFilterButtonsUI();
  updateAdminDashboard();
}

function renderRevenueChart(labels, revenueValues, movingAverage) {
  if (!adminRevenueChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminRevenueChartStatus) adminRevenueChartStatus.textContent = "Chart.js requis";
    return;
  }

  const ctx = adminRevenueChartCanvas.getContext("2d");
  if (!agencyState.charts.revenue) {
    agencyState.charts.revenue = new Chart(adminRevenueChartCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "CA mensuel",
            data: revenueValues,
            backgroundColor: "rgba(255,142,60,0.75)",
            borderRadius: 12,
            maxBarThickness: 48
          },
          {
            type: "line",
            label: "Moyenne mobile",
            data: movingAverage,
            borderColor: "#1e1f24",
            backgroundColor: "rgba(30,31,36,0.08)",
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            spanGaps: true
          }
        ]
      },
      options: {
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.dataset.label || "";
                const value = Number(context.parsed.y || 0);
                return `${label} : ${formatCurrency(value, { maximumFractionDigits: 0 })}`;
              }
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback(value) {
                return formatCurrency(Number(value), { maximumFractionDigits: 0 });
              }
            },
            grid: { color: "rgba(30,31,36,0.08)" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  } else {
    const chart = agencyState.charts.revenue;
    chart.data.labels = labels;
    chart.data.datasets[0].data = revenueValues;
    chart.data.datasets[1].data = movingAverage;
    chart.update();
  }
}

function renderClientsChart(labels, clientTotals) {
  if (!adminClientsChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminClientsChartStatus) adminClientsChartStatus.textContent = "Chart.js requis";
    return;
  }

  if (!agencyState.charts.clients) {
    agencyState.charts.clients = new Chart(adminClientsChartCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Clients cumulés",
            data: clientTotals,
            borderColor: "rgba(61,181,166,1)",
            backgroundColor: "rgba(61,181,166,0.15)",
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return `${formatCount(Number(context.parsed.y || 0))} clients`;
              }
            }
          }
        },
        scales: {
          y: {
            ticks: {
              precision: 0,
              callback(value) {
                return formatCount(Number(value));
              }
            },
            grid: { color: "rgba(30,31,36,0.08)" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  } else {
    const chart = agencyState.charts.clients;
    chart.data.labels = labels;
    chart.data.datasets[0].data = clientTotals;
    chart.update();
  }
}

function renderRatioChart(newClients, existingClients) {
  if (!adminRatioChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminRatioChartStatus) adminRatioChartStatus.textContent = "Chart.js requis";
    return;
  }

  const dataset = [Math.max(newClients, 0), Math.max(existingClients, 0)];
  const labels = ["Nouveaux", "Existants"];

  if (!agencyState.charts.ratio) {
    agencyState.charts.ratio = new Chart(adminRatioChartCanvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: dataset,
            backgroundColor: ["rgba(255,142,60,0.9)", "rgba(30,31,36,0.15)"],
            borderWidth: 0,
            hoverOffset: 4
          }
        ]
      },
      options: {
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.label || "";
                const value = context.parsed;
                return `${label} : ${formatCount(value)} clients`;
              }
            }
          }
        },
        cutout: "68%"
      }
    });
  } else {
    const chart = agencyState.charts.ratio;
    chart.data.datasets[0].data = dataset;
    chart.update();
  }
}

function renderRetentionChart(labels, datasetMatrix) {
  if (!adminRetentionChartCanvas) return;
  if (typeof Chart === "undefined") {
    if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = "Chart.js requis";
    return;
  }

  const datasets = datasetMatrix.map(item => ({
    label: item.label,
    data: item.values,
    borderColor: item.color,
    backgroundColor: item.fill,
    borderWidth: 2,
    tension: 0.3,
    fill: false,
    spanGaps: true
  }));

  if (!agencyState.charts.retention) {
    agencyState.charts.retention = new Chart(adminRetentionChartCanvas, {
      type: "line",
      data: {
        labels,
        datasets
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.dataset.label || "";
                const value = Number(context.parsed.y || 0);
                return `${label} : ${value.toFixed(1)}%`;
              }
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              callback(value) {
                return `${value}%`;
              }
            },
            grid: { color: "rgba(30,31,36,0.08)" }
          },
          x: {
            grid: { color: "rgba(30,31,36,0.06)" }
          }
        }
      }
    });
  } else {
    const chart = agencyState.charts.retention;
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
  }
}

function updateAdminDashboard() {
  if (!isAdminRoute) return;

  const activePreset = agencyState.filter ? agencyState.filter.preset : "";
  if (adminKpiMonthlyThumbsLabelEl) {
    adminKpiMonthlyThumbsLabelEl.textContent = resolveMonthlyThumbsLabel(activePreset);
  }

  const hasData = Array.isArray(agencyState.normalized) && agencyState.normalized.length > 0;
  if (!hasData) {
    if (adminPeriodLabel) adminPeriodLabel.textContent = "Aucune donnée disponible";
    if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = "—";
    if (adminKpiMonthlyThumbsEl) adminKpiMonthlyThumbsEl.textContent = "—";
    if (adminKpiClientsEl) adminKpiClientsEl.textContent = "—";
    if (adminKpiAverageBasketEl) adminKpiAverageBasketEl.textContent = "—";
    if (adminKpiNewClientRateEl) adminKpiNewClientRateEl.textContent = "—";
    if (adminKpiActiveRateEl) adminKpiActiveRateEl.textContent = "—";
    if (adminKpiActiveTooltip) adminKpiActiveTooltip.textContent = "—";
    if (adminKpiOrdersPerClientEl) adminKpiOrdersPerClientEl.textContent = "—";
    if (adminKpiCltvEl) adminKpiCltvEl.textContent = "—";
    if (adminRevenueChartStatus) adminRevenueChartStatus.textContent = "—";
    if (adminClientsChartStatus) adminClientsChartStatus.textContent = "—";
    if (adminRatioChartStatus) adminRatioChartStatus.textContent = "—";
    if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = "—";
    kpiTrendElements.forEach(element => resetTrendIndicator(element, "Pas de données"));
    updateInsightsView(null, null);
    displayDashboardEmptyState(true);
    renderRevenueChart([], [], []);
    renderClientsChart([], []);
    renderRatioChart(0, 0);
    renderRetentionChart([], []);
    updateChartTrendStyles({ revenueTrend: null, clientsTrend: null, ratioTrend: null, retentionTrend: null });
    return;
  }

  const { start, end, label } = computeActivePeriod();
  updateFilterButtonsUI();
  if (adminPeriodLabel) adminPeriodLabel.textContent = label;
  const dashboardCopy = ADMIN_VIEW_COPY.dashboard;
  if (adminTopSubtitle) {
    const base = dashboardCopy ? dashboardCopy.subtitle : "";
    adminTopSubtitle.textContent = base ? `${base} — ${label}` : label;
  }

  const currentMetrics = computeRangeMetrics(start, end);
  const previousRange = computePreviousPeriodRange(start, end);
  const previousMetrics = previousRange ? computeRangeMetrics(previousRange.start, previousRange.end) : null;

  if (adminKpiMonthlyThumbsEl) {
    adminKpiMonthlyThumbsEl.textContent = formatCount(currentMetrics.quantity);
  }

  const hasFiltered = currentMetrics.filtered.length > 0;
  displayDashboardEmptyState(!hasFiltered);

  updateInsightsView(currentMetrics, previousMetrics);

  if (!hasFiltered) {
    if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = "—";
    if (adminKpiClientsEl) adminKpiClientsEl.textContent = "—";
    if (adminKpiAverageBasketEl) adminKpiAverageBasketEl.textContent = "—";
    if (adminKpiNewClientRateEl) adminKpiNewClientRateEl.textContent = "—";
    if (adminKpiActiveRateEl) adminKpiActiveRateEl.textContent = "—";
    if (adminKpiActiveTooltip) adminKpiActiveTooltip.textContent = "—";
    if (adminKpiOrdersPerClientEl) adminKpiOrdersPerClientEl.textContent = "—";
    if (adminKpiCltvEl) adminKpiCltvEl.textContent = "—";
    if (adminRevenueChartStatus) adminRevenueChartStatus.textContent = "Aucune donnée";
    if (adminClientsChartStatus) adminClientsChartStatus.textContent = "Aucune donnée";
    if (adminRatioChartStatus) adminRatioChartStatus.textContent = "Aucune donnée";
    if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = "Aucune donnée";
    kpiTrendElements.forEach(element => resetTrendIndicator(element, "Pas de données"));
    renderRevenueChart([], [], []);
    renderClientsChart([], []);
    renderRatioChart(0, 0);
    renderRetentionChart([], []);
    updateChartTrendStyles({ revenueTrend: null, clientsTrend: null, ratioTrend: null, retentionTrend: null });
    return;
  }

  const totalRevenue = currentMetrics.revenue;
  const totalOrders = currentMetrics.orders;
  const activeClientsCount = currentMetrics.activeClientsCount;
  const totalKnownClients = currentMetrics.totalKnownClients;
  const newClientsCount = currentMetrics.newClientsCount;
  const newClientsRate = currentMetrics.newClientsRate;
  const averageBasket = currentMetrics.averageBasket;
  const activeRate = currentMetrics.activeRate;
  const totalExisting = Math.max(activeClientsCount - newClientsCount, 0);

  if (adminKpiRevenueEl) adminKpiRevenueEl.textContent = formatCurrency(totalRevenue, { maximumFractionDigits: 0 });
  if (adminKpiClientsEl) adminKpiClientsEl.textContent = formatCount(activeClientsCount);
  if (adminKpiAverageBasketEl) adminKpiAverageBasketEl.textContent = formatCurrency(averageBasket, { maximumFractionDigits: 2 });
  if (adminKpiNewClientRateEl) adminKpiNewClientRateEl.textContent = formatPercent(newClientsRate);
  if (adminKpiActiveRateEl) adminKpiActiveRateEl.textContent = formatPercent(activeRate, 1);

  const lifetimeCurrent = computeLifetimeMetricsUpTo(null);
  const lifetimePrevious = previousRange ? computeLifetimeMetricsUpTo(previousRange.end) : null;

  if (adminKpiActiveTooltip) {
    adminKpiActiveTooltip.textContent = `${formatCount(activeClientsCount)} actifs / ${formatCount(totalKnownClients)} clients`;
  }
  if (adminKpiOrdersPerClientEl) {
    adminKpiOrdersPerClientEl.textContent = lifetimeCurrent.ordersPerClient.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }
  if (adminKpiCltvEl) {
    adminKpiCltvEl.textContent = formatCurrency(lifetimeCurrent.cltv, { maximumFractionDigits: 0 });
  }

  if (adminRevenueChartStatus) {
    const statusText = lastDirectorySync ? `MAJ ${formatDateTime(lastDirectorySync)}` : `${totalOrders} commandes`;
    adminRevenueChartStatus.textContent = statusText;
  }
  if (adminClientsChartStatus) adminClientsChartStatus.textContent = `${formatCount(totalKnownClients)} clients`;
  if (adminRatioChartStatus) adminRatioChartStatus.textContent = `${formatCount(newClientsCount)} nouveaux`;
  if (adminRetentionChartStatus) adminRetentionChartStatus.textContent = `${formatCount(totalKnownClients)} clients analysés`;

  const startBoundary = start ? start.getTime() : Number.NEGATIVE_INFINITY;
  const endBoundary = end ? end.getTime() : Number.POSITIVE_INFINITY;
  const rangeStart = start || (currentMetrics.filtered[0] ? startOfDay(currentMetrics.filtered[0].date) : null);
  const rangeEnd = end || (currentMetrics.filtered[currentMetrics.filtered.length - 1]
    ? endOfDay(currentMetrics.filtered[currentMetrics.filtered.length - 1].date)
    : null);
  const timeline = buildMonthlyTimeline(rangeStart, rangeEnd);
  const monthKeys = timeline.map(getMonthKey);
  const monthIndex = new Map();
  monthKeys.forEach((key, idx) => monthIndex.set(key, idx));

  const revenuePerMonth = new Array(timeline.length).fill(0);
  currentMetrics.filtered.forEach(entry => {
    const key = getMonthKey(entry.date);
    const idx = monthIndex.get(key);
    if (idx !== undefined) {
      revenuePerMonth[idx] += entry.revenue || 0;
    }
  });

  const movingAverage = computeMovingAverage(revenuePerMonth);
  const timelineLabels = timeline.map(formatMonthLabel);

  const clientTotals = timeline.map(monthStart => {
    const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
    let count = 0;
    agencyState.firstOrderByClient.forEach(firstDate => {
      if (firstDate.getTime() <= monthEnd.getTime()) count += 1;
    });
    return count;
  });

  const retentionBuckets = [
    { label: "+1 mois", months: 1, color: "rgba(123,110,255,1)", fill: "rgba(123,110,255,0.2)" },
    { label: "+3 mois", months: 3, color: "rgba(61,181,166,1)", fill: "rgba(61,181,166,0.2)" },
    { label: "+6 mois", months: 6, color: "rgba(255,142,60,1)", fill: "rgba(255,142,60,0.25)" },
    { label: "+12 mois", months: 12, color: "rgba(30,31,36,0.8)", fill: "rgba(30,31,36,0.18)" }
  ];

  const timelineForRetention = timeline;
  const retentionLabels = timelineForRetention.map(formatMonthLabel);
  const retentionMatrix = retentionBuckets.map(bucket => ({
    label: bucket.label,
    color: bucket.color,
    fill: bucket.fill,
    values: new Array(timelineForRetention.length).fill(0)
  }));

  const firstOrderMap = agencyState.firstOrderByClient;
  const ordersTimeline = agencyState.global.timelineByClient || new Map();

  const uniqueClients = Array.from(firstOrderMap.keys());
  uniqueClients.forEach(client => {
    const firstDate = firstOrderMap.get(client);
    if (!firstDate) return;
    if (end && firstDate.getTime() > endBoundary) return;
    const clientOrders = ordersTimeline.get(client) || [];
    if (!clientOrders.length) return;
    timelineForRetention.forEach((monthStart, idx) => {
      const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
      retentionBuckets.forEach((bucket, bucketIdx) => {
        const threshold = new Date(firstDate);
        threshold.setMonth(threshold.getMonth() + bucket.months);
        if (threshold.getTime() > monthEnd.getTime()) return;
        const hasAnotherOrder = clientOrders.some(orderDate => {
          return orderDate.getTime() >= threshold.getTime() && orderDate.getTime() <= monthEnd.getTime();
        });
        if (hasAnotherOrder) {
          retentionMatrix[bucketIdx].values[idx] += 1;
        }
      });
    });
  });

  retentionMatrix.forEach(bucket => {
    bucket.values = bucket.values.map((count, idx) => {
      const totalAtMonth = clientTotals[idx] || 0;
      return totalAtMonth ? (count / totalAtMonth) * 100 : 0;
    });
  });

  const revenueDelta = applyTrendIndicator(
    adminKpiRevenueDeltaEl,
    totalRevenue,
    previousMetrics ? previousMetrics.revenue : null
  );
  applyTrendIndicator(
    adminKpiMonthlyThumbsDeltaEl,
    currentMetrics.quantity,
    previousMetrics ? previousMetrics.quantity : null
  );
  const clientsDelta = applyTrendIndicator(
    adminKpiClientsDeltaEl,
    activeClientsCount,
    previousMetrics ? previousMetrics.activeClientsCount : null
  );
  applyTrendIndicator(
    adminKpiAverageBasketDeltaEl,
    averageBasket,
    previousMetrics ? previousMetrics.averageBasket : null
  );
  const newClientRateDelta = applyTrendIndicator(
    adminKpiNewClientRateDeltaEl,
    newClientsRate,
    previousMetrics ? previousMetrics.newClientsRate : null
  );
  const activeRateDelta = applyTrendIndicator(
    adminKpiActiveRateDeltaEl,
    activeRate,
    previousMetrics ? previousMetrics.activeRate : null
  );
  applyTrendIndicator(
    adminKpiOrdersPerClientDeltaEl,
    lifetimeCurrent.ordersPerClient,
    lifetimePrevious ? lifetimePrevious.ordersPerClient : null
  );
  applyTrendIndicator(
    adminKpiCltvDeltaEl,
    lifetimeCurrent.cltv,
    lifetimePrevious ? lifetimePrevious.cltv : null
  );

  renderRevenueChart(timelineLabels, revenuePerMonth, movingAverage);
  renderClientsChart(timelineLabels, clientTotals);
  renderRatioChart(newClientsCount, totalExisting);
  renderRetentionChart(retentionLabels, retentionMatrix);

  updateChartTrendStyles({
    revenueTrend: revenueDelta.trend,
    clientsTrend: clientsDelta.trend,
    ratioTrend: newClientRateDelta.trend,
    retentionTrend: activeRateDelta.trend
  });
}

async function initializeAgencyDashboard(force = false) {
  if (!isAdminRoute) return;
  if (agencyLoading) return;
  if (agencyInitialized && !force) {
    updateAdminDashboard();
    return;
  }
  if (!DEFAULT_BASE_ID || !DEFAULT_TABLE_ID) {
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = "Renseigne la base Airtable pour activer les indicateurs.";
    }
    return;
  }

  try {
    agencyLoading = true;
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = "Chargement des indicateurs…";
    }
    const rows = await fetchAirtableRows({
      baseId: DEFAULT_BASE_ID,
      tableId: DEFAULT_TABLE_ID,
      view: DEFAULT_VIEW_ID || undefined
    });
    prepareAgencyDataset(rows);
    agencyInitialized = true;
    markLastSync();
    updateAdminDashboard();
  } catch (error) {
    console.error("Impossible de charger les indicateurs agence", error);
    if (adminTopSubtitle) {
      adminTopSubtitle.textContent = (error && error.message) ? error.message : "Erreur lors du chargement des indicateurs.";
    }
    displayDashboardEmptyState(true);
  } finally {
    agencyLoading = false;
  }
}

function renderClientList(filter = "") {
  if (!clientList) return;
  const term = filter.trim().toLowerCase();
  const entries = discoveredClients
    .filter(entry => !term || entry.label.toLowerCase().includes(term) || entry.slug.includes(term))
    .sort((a, b) => a.label.localeCompare(b.label));

  clientList.innerHTML = "";
  if (!entries.length) {
    clientList.innerHTML = `<p class="empty admin-empty">Aucun client trouvé.</p>`;
    return;
  }

  entries.forEach(({ slug, label }) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "client-card";
    if (activeAdminClient && activeAdminClient === slug) card.classList.add("active");
    card.innerHTML = `<span class="client-card-name">${label}</span><span class="client-card-slug">${slug}</span>`;
    card.addEventListener("click", () => handleAdminSelect(slug));
    clientList.appendChild(card);
  });
}

function handleAdminSelect(slug) {
  setAdminView("clients");
  const normalizedSlug = toSlug(slug);
  const entry = discoveredClients.find(item => item.slug === normalizedSlug) || null;
  const config = applyClientConfig(normalizedSlug, {
    bypassAccessKey: true,
    labelOverride: entry ? entry.label : undefined,
    accessKeyOverride: entry ? entry.accessKey : undefined
  });
  if (!config) {
    alert("Configuration incomplète pour ce client.");
    return;
  }
  currentClientConfig = config;
  activeAdminClient = normalizedSlug;
  setClientContext(entry ? entry.label : (config.label || slugToName(normalizedSlug)));
  renderClientList(clientSearchInput ? clientSearchInput.value : "");
  if (shareTitle) shareTitle.textContent = entry ? entry.label : (config.label || slugToName(normalizedSlug));
  if (shareSubtitle) shareSubtitle.textContent = `Identifiant : ${normalizedSlug}`;
  loadAirtable(config);
  updateMiniaturesLibrary(config);
  if (shareBox) {
    const params = new URLSearchParams();
    params.set("client", normalizedSlug);
    const shareKey = config.accessKey || generateAccessKey(normalizedSlug);
    if (shareKey) {
      params.set("key", shareKey);
      if (shareHint) shareHint.textContent = "Partage ce lien, la clé d'accès est déjà incluse.";
    } else if (shareHint) {
      shareHint.textContent = "Aucune clé définie pour ce client (accès libre).";
    }
    const origin = location.origin && location.origin !== "null" ? location.origin : `${location.protocol}//${location.host}`;
    if (shareLinkInput) shareLinkInput.value = `${origin || ""}${location.pathname}?${params.toString()}`;
    shareBox.classList.add("visible");
  }
  if (adminTablePlaceholder) adminTablePlaceholder.classList.add("hidden");
  if (adminTableHost) adminTableHost.classList.remove("hidden");
  const params = new URLSearchParams(location.search);
  params.set("mode", "admin");
  params.set("client", normalizedSlug);
  params.delete("key");
  history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
}

async function buildClientDirectory() {
  const map = new Map();
  Object.entries(CLIENTS).forEach(([slug, cfg]) => {
    const normalized = toSlug(slug);
    const label = cfg.label || slugToName(slug);
    map.set(normalized, {
      slug: normalized,
      label,
      accessKey: cfg.accessKey || generateAccessKey(normalized)
    });
  });

  if (DEFAULT_BASE_ID && DEFAULT_TABLE_ID && DEFAULT_PSEUDO_FIELD) {
    try {
      const response = await fetch("/api/airtable/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          baseId: DEFAULT_BASE_ID,
          tableId: DEFAULT_TABLE_ID,
          view: DEFAULT_VIEW_ID || undefined,
          fields: [DEFAULT_PSEUDO_FIELD],
          pageSize: 100
        })
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error((payload && payload.error) || `Airtable ${response.status}`);
      (payload.records || []).forEach(record => {
        const field = record.fields ? record.fields[DEFAULT_PSEUDO_FIELD] : null;
        let label = "";
        if (Array.isArray(field)) {
          label = field.find(v => typeof v === "string" && v.trim()) || "";
        } else if (typeof field === "string") {
          label = field;
        }
        label = (label || "").trim();
        if (!label) return;
        const normalized = toSlug(label);
        if (!normalized || map.has(normalized)) return;
        map.set(normalized, {
          slug: normalized,
          label,
          accessKey: generateAccessKey(normalized)
        });
      });
    } catch (err) {
      console.warn("Impossible de récupérer la liste des clients Airtable :", err);
    }
  }

  discoveredClients = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  updateAdminDirectoryStats();
}

async function enterAdminMode(initialSlug) {
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  showAdminUI();
  if (adminLogin) adminLogin.classList.remove("visible");
  if (adminLoginError) adminLoginError.textContent = "";
  if (shareBox) {
    shareBox.classList.remove("visible");
    if (shareLinkInput) shareLinkInput.value = "";
    if (shareHint) shareHint.textContent = "Sélectionne un client pour générer le lien de partage.";
    if (shareTitle) shareTitle.textContent = "Sélectionne un client";
    if (shareSubtitle) shareSubtitle.textContent = "Choisis un client dans la liste pour générer le lien sécurisé.";
  }
  if (adminTablePlaceholder) adminTablePlaceholder.classList.remove("hidden");
  if (adminTableHost) adminTableHost.classList.add("hidden");
  if (clientSearchInput) clientSearchInput.value = "";
  adminDriveDirectory = [];
  adminDriveDirectoryLoaded = false;
  adminDriveDirectoryLoading = false;
  adminDriveActiveSlug = null;
  adminDriveCache.clear();
  if (adminMiniaturesClientList) adminMiniaturesClientList.innerHTML = "";
  if (adminMiniaturesCountEl) adminMiniaturesCountEl.textContent = "— dossiers";
  clearAdminMiniaturesSelection();
  setAdminView(initialSlug ? "clients" : activeAdminView || "clients");
  await buildClientDirectory();
  const normalizedInitial = initialSlug ? toSlug(initialSlug) : null;
  if (normalizedInitial && !discoveredClients.some(entry => entry.slug === normalizedInitial)) {
    discoveredClients.push({
      slug: normalizedInitial,
      label: slugToName(normalizedInitial),
      accessKey: generateAccessKey(normalizedInitial)
    });
    discoveredClients.sort((a, b) => a.label.localeCompare(b.label));
    updateAdminDirectoryStats();
  }
  renderClientList(clientSearchInput ? clientSearchInput.value : "");
  if (normalizedInitial && discoveredClients.some(entry => entry.slug === normalizedInitial)) {
    setAdminView("clients");
    handleAdminSelect(normalizedInitial);
  } else {
    currentClientConfig = null;
    setClientContext("");
    if (adminTablePlaceholder) adminTablePlaceholder.classList.remove("hidden");
    if (adminTableHost) adminTableHost.classList.add("hidden");
  }
  initializeAgencyDashboard();
}

function showAdminUI() {
  document.body.classList.remove("client-mode");
  document.body.classList.add("admin-mode");
  if (loginWrapper) loginWrapper.classList.add("hidden");
  if (clientContainer) clientContainer.classList.add("hidden");
  if (adminLayout) adminLayout.classList.remove("admin-hidden");
  if (activeAdminView === "clients") ensureTableInHost(adminTableHost);
}

function showLoginUI() {
  document.body.classList.remove("admin-mode");
  document.body.classList.remove("client-mode");
  if (loginWrapper) loginWrapper.classList.remove("hidden");
  if (adminLayout) adminLayout.classList.add("admin-hidden");
  if (clientContainer) clientContainer.classList.remove("hidden");
  currentClientConfig = null;
  updateOpenOrdersDisplay("—");
  setClientContext("");
  ensureTableInHost(clientTableHost);
  resetClientView();
  updateMiniaturesLibrary(null);
  if (shareBox) {
    shareBox.classList.remove("visible");
    if (shareLinkInput) shareLinkInput.value = "";
    if (shareHint) shareHint.textContent = "";
    if (shareTitle) shareTitle.textContent = "Sélectionne un client";
    if (shareSubtitle) shareSubtitle.textContent = "Choisis un client dans la liste pour générer le lien sécurisé.";
  }
  if (adminTablePlaceholder) adminTablePlaceholder.classList.remove("hidden");
  if (adminTableHost) adminTableHost.classList.add("hidden");
}

const ADMIN_VIEW_COPY = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Suivi en temps réel de l'activité Miniads."
  },
  insights: {
    title: "Insights & Performances",
    subtitle: "Analyse des tendances clés sur la période sélectionnée."
  },
  clients: {
    title: "Mes clients",
    subtitle: "Sélectionne un créateur pour charger ses miniatures et copier son lien sécurisé."
  },
  miniatures: {
    title: "Miniatures réalisées",
    subtitle: "Explore toutes les miniatures livrées par dossier client."
  },
  extension: {
    title: "Extension YouTube",
    subtitle: "Installe l'extension pour afficher les visuels directement dans YouTube Studio."
  }
};

function setAdminView(view) {
  if (!view || !adminViews[view]) return;
  activeAdminView = view;
  adminNavLinks.forEach(link => {
    if (!link.dataset.adminView) return;
    link.classList.toggle("active", link.dataset.adminView === view);
  });
  Object.entries(adminViews).forEach(([name, section]) => {
    if (!section) return;
    section.classList.toggle("active", name === view);
  });
  const copy = ADMIN_VIEW_COPY[view];
  if (copy) {
    if (adminTopTitle) adminTopTitle.textContent = copy.title;
    if (adminTopSubtitle) adminTopSubtitle.textContent = copy.subtitle;
  }
  if (view === "dashboard" || view === "insights") {
    initializeAgencyDashboard();
  }
  if (view === "clients") {
    ensureTableInHost(adminTableHost);
  }
}

function updateAdminDirectoryStats() {
  if (adminActiveClientEl && !activeAdminClient) {
    adminActiveClientEl.textContent = "—";
  }
}

function markLastSync() {
  lastDirectorySync = new Date();
}

async function checkAdminSession() {
  try {
    const response = await fetch("/api/admin/me", { credentials: "include" });
    return response.ok;
  } catch (_e) {
    return false;
  }
}

async function initAdminFlow() {
  setClientContext("");
  const hasSession = await checkAdminSession();
  if (!hasSession) {
    const redirectParam = encodeURIComponent(window.location.href);
    window.location.replace(`/admin-login.html?redirect=${redirectParam}`);
    return;
  }

  enterAdminMode(rawClientParam ? rawClientParam.toLowerCase() : null).catch(err => {
    console.error("Erreur lors de l'initialisation admin", err);
  });

  if (adminNavLinks.length) {
    adminNavLinks.forEach(link => {
      link.addEventListener("click", () => {
        const view = link.dataset.adminView || "clients";
        setAdminView(view);
      });
    });
  }

  if (adminFilterButtons.length) {
    adminFilterButtons.forEach(button => {
      button.addEventListener("click", () => {
        const preset = button.dataset.adminRange;
        if (!preset) return;
        if (preset === "custom") {
          agencyState.filter.preset = "custom";
          updateFilterButtonsUI();
          updateAdminDashboard();
        } else {
          setDashboardPreset(preset);
        }
      });
    });
  }

  if (adminApplyCustomBtn) {
    adminApplyCustomBtn.addEventListener("click", () => {
      applyCustomDateRange();
    });
  }

  if (clientSearchInput) {
    clientSearchInput.addEventListener("input", e => renderClientList(e.target.value));
  }

  if (copyShareBtn && shareLinkInput) {
    copyShareBtn.addEventListener("click", async () => {
      if (!shareLinkInput.value) return;
      try {
        await navigator.clipboard.writeText(shareLinkInput.value);
        copyShareBtn.textContent = "Copié !";
        setTimeout(() => { copyShareBtn.textContent = "Copier"; }, 1500);
      } catch (err) {
        console.warn("Impossible de copier dans le presse-papiers", err);
      }
    });
  }

  updateFilterButtonsUI();
}
