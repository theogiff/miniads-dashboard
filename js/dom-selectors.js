// --- Sélecteurs ---
const grid = document.getElementById("grid");
const airtableKeyInput = document.getElementById("airtableKey");
const airtableBaseInput = document.getElementById("airtableBase");
const airtableTableInput = document.getElementById("airtableTable");
const airtableViewInput = document.getElementById("airtableView");
const airtableBtn = document.getElementById("loadAirtableBtn");
const summaryBody = document.getElementById("summaryBody");
const clientBadge = document.getElementById("clientBadge");
const clientTitle = document.getElementById("clientTitle");
const clientGreeting = document.getElementById("clientGreeting");
const clientNavLinks = Array.from(document.querySelectorAll("[data-client-view]:is(.client-nav-link, .sidebar-link)"));
const clientScrollLinks = Array.from(document.querySelectorAll(".client-nav-link[data-scroll-target]"));
const clientViewSections = Array.from(document.querySelectorAll(".client-view[data-client-view]"));
const miniaturesContent = document.getElementById("miniaturesContent");
const miniaturesEmbed = document.getElementById("miniaturesEmbed");
const miniaturesDriveFrame = document.getElementById("miniaturesDriveFrame");
const MINIADS_API_MODE = true; // ⬅️ active le mode API
const MINIADS_EXTENSION_ID = window.MINIADS_EXTENSION_ID || "";
const MINIADS_EXTENSION_INSTALL_URL = window.MINIADS_EXTENSION_INSTALL_URL
  || (MINIADS_EXTENSION_ID
    ? `https://chrome.google.com/webstore/detail/${MINIADS_EXTENSION_ID}`
    : "https://chrome.google.com/webstore");
const miniaturesGrid = document.getElementById("miniaturesGrid");
const viewSwitchButtons = Array.from(document.querySelectorAll(".switch-btn"));
const pipOverlay = document.getElementById("miniaturePip");
const pipImage = document.getElementById("miniaturePipImage");
const pipTitle = document.getElementById("miniaturePipTitle");
const pipSubtitle = document.getElementById("miniaturePipSubtitle");
const pipOpenLink = document.getElementById("miniaturePipOpen");
const pipDownloadLink = document.getElementById("miniaturePipDownload");
const topbar = document.querySelector(".topbar");

const miniaturesExternalLink = document.getElementById("miniaturesExternalLink");
const miniaturesFolderList = document.getElementById("miniaturesFolderList");
const miniaturesEmptyState = document.getElementById("miniaturesEmptyState");
const miniaturesEmbedHint = document.getElementById("miniaturesEmbedHint");
const miniaturesEmbedTitle = document.getElementById("miniaturesEmbedTitle");
const miniaturesEmbedSubtitle = document.getElementById("miniaturesEmbedSubtitle");
const adminLogin = document.getElementById("adminLogin");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminEmailInput = document.getElementById("adminEmail");
const adminPasswordInput = document.getElementById("adminPassword");
const adminLoginError = document.getElementById("adminLoginError");
const adminPanel = document.getElementById("adminPanel");
const clientSearchInput = document.getElementById("clientSearch");
const clientList = document.getElementById("clientList");
const shareBox = document.getElementById("shareBox");
const shareLinkInput = document.getElementById("shareLink");
const shareHint = document.getElementById("shareHint");
const shareTitle = document.getElementById("shareTitle");
const shareSubtitle = document.getElementById("shareSubtitle");
const copyShareBtn = document.getElementById("copyShareLink");
const loginWrapper = document.getElementById("loginWrapper");
const clientContainer = document.getElementById("clientContainer");
const adminLayout = document.getElementById("adminLayout");
const clientTableHost = document.getElementById("clientTableHost");
const adminTableHost = document.getElementById("adminTableHost");
const adminTablePlaceholder = document.getElementById("adminTablePlaceholder");
const tableSection = document.getElementById("tableSection");
const adminTopTitle = document.getElementById("adminTopTitle");
const adminTopSubtitle = document.getElementById("adminTopSubtitle");
const adminNavLinks = Array.from(document.querySelectorAll(".sidebar-link[data-admin-view]"));
const adminViews = {
  dashboard: document.getElementById("adminDashboardView"),
  insights: document.getElementById("adminInsightsView"),
  clients: adminPanel,
  miniatures: document.getElementById("adminMiniaturesView"),
  extension: document.getElementById("adminExtensionView")
};
const totalThumbsEl = document.getElementById("totalThumbs");
const deliveredThisMonthEl = document.getElementById("deliveredThisMonth");
const monthlyDeliveryValueEl = document.getElementById("monthlyDeliveryValue");
const lastDeliveredEl = document.getElementById("lastDelivered");
const adminPeriodLabel = document.getElementById("adminPeriodLabel");
const adminFilterButtons = Array.from(document.querySelectorAll(".filter-chip[data-admin-range]"));
const adminStartInput = document.getElementById("adminStartDate");
const adminEndInput = document.getElementById("adminEndDate");
const adminApplyCustomBtn = document.getElementById("adminApplyCustom");
const adminKpiRevenueEl = document.getElementById("adminKpiRevenue");
const adminKpiMonthlyThumbsLabelEl = document.getElementById("adminKpiMonthlyThumbsLabel");
const adminKpiMonthlyThumbsEl = document.getElementById("adminKpiMonthlyThumbs");
const adminKpiClientsEl = document.getElementById("adminKpiClients");
const adminKpiAverageBasketEl = document.getElementById("adminKpiAverageBasket");
const adminKpiNewClientRateEl = document.getElementById("adminKpiNewClientRate");
const adminKpiActiveRateEl = document.getElementById("adminKpiActiveRate");
const adminKpiActiveTooltip = document.getElementById("adminKpiActiveTooltip");
const adminKpiOrdersPerClientEl = document.getElementById("adminKpiOrdersPerClient");
const adminKpiCltvEl = document.getElementById("adminKpiCltv");
const adminKpiRevenueDeltaEl = document.getElementById("adminKpiRevenueDelta");
const adminKpiMonthlyThumbsDeltaEl = document.getElementById("adminKpiMonthlyThumbsDelta");
const adminKpiClientsDeltaEl = document.getElementById("adminKpiClientsDelta");
const adminKpiAverageBasketDeltaEl = document.getElementById("adminKpiAverageBasketDelta");
const adminKpiNewClientRateDeltaEl = document.getElementById("adminKpiNewClientRateDelta");
const adminKpiActiveRateDeltaEl = document.getElementById("adminKpiActiveRateDelta");
const adminKpiOrdersPerClientDeltaEl = document.getElementById("adminKpiOrdersPerClientDelta");
const adminKpiCltvDeltaEl = document.getElementById("adminKpiCltvDelta");
const adminRevenueChartCanvas = document.getElementById("adminRevenueChart");
const adminClientsChartCanvas = document.getElementById("adminClientsChart");
const adminRatioChartCanvas = document.getElementById("adminRatioChart");
const adminRetentionChartCanvas = document.getElementById("adminRetentionChart");
const adminRevenueChartStatus = document.getElementById("adminRevenueChartStatus");
const adminClientsChartStatus = document.getElementById("adminClientsChartStatus");
const adminRatioChartStatus = document.getElementById("adminRatioChartStatus");
const adminRetentionChartStatus = document.getElementById("adminRetentionChartStatus");
const adminDashboardEmpty = document.getElementById("adminDashboardEmpty");
const adminActiveClientEl = document.getElementById("adminActiveClient");
const heroDateEl = document.getElementById("heroDate");
const heroLastDeliveryEl = document.getElementById("heroLastDeliveryValue");
const openOrdersEl = document.getElementById("openOrdersValue");
const clientInitialsEl = document.getElementById("clientInitials");
const insightsReturningValue = document.getElementById("insightsReturningValue");
const insightsReturningDelta = document.getElementById("insightsReturningDelta");
const insightsAverageBasketValue = document.getElementById("insightsAverageBasketValue");
const insightsAverageBasketDelta = document.getElementById("insightsAverageBasketDelta");
const insightsActiveRateValue = document.getElementById("insightsActiveRateValue");
const insightsActiveRateDelta = document.getElementById("insightsActiveRateDelta");
const insightsNewClientsValue = document.getElementById("insightsNewClientsValue");
const insightsNewClientsMeta = document.getElementById("insightsNewClientsMeta");
const insightsNewClientsDelta = document.getElementById("insightsNewClientsDelta");
const kpiTrendElements = [
  adminKpiRevenueDeltaEl,
  adminKpiMonthlyThumbsDeltaEl,
  adminKpiClientsDeltaEl,
  adminKpiAverageBasketDeltaEl,
  adminKpiNewClientRateDeltaEl,
  adminKpiActiveRateDeltaEl,
  adminKpiOrdersPerClientDeltaEl,
  adminKpiCltvDeltaEl
];
let currentClientLabel = "";
let activeClientView = "dashboard";
let activeDriveFolderIndex = 0;
let activeAdminClient = null;
let discoveredClients = [];
let activeAdminView = "dashboard";
let lastDirectorySync = null;
let currentClientConfig = null;
let adminDriveDirectory = [];
let adminDriveDirectoryLoaded = false;
let adminDriveDirectoryLoading = false;
let adminDriveActiveSlug = null;
const adminDriveCache = new Map();
const adminMiniaturesClientList = document.getElementById("adminMiniaturesClientList");
const adminMiniaturesCountEl = document.getElementById("adminMiniaturesCountEl");
function clearAdminMiniaturesSelection() {}
