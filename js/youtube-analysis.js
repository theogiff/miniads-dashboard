// --- YouTube Analysis (LUS Style) ---

let ytBarChart = null;
let ytTimeSeriesChart = null;
let ytAllVideos = [];

// Renamed from duplicate formatCount to formatCountCompact
function formatCountCompact(num) {
  if (!num && num !== 0) return "0";
  const n = parseInt(num, 10);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString("fr-FR");
}

function formatDateShort(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function buildTableRows(videos, avgViews) {
  return videos.map((v, i) => {
    const ratio = avgViews > 0 ? (v.views / avgViews).toFixed(1) : "0";
    return `<tr>
      <td>${i + 1}</td>
      <td class="yt-table-title-cell"><img src="${v.thumbnail}" class="yt-table-thumb"><span>${v.title}</span></td>
      <td>${formatCountCompact(v.views)}</td>
      <td>${formatCountCompact(v.likes)}</td>
      <td>${v.durationFormatted}</td>
      <td>${formatDateShort(v.publishedAt)}</td>
      <td><span class="yt-ratio-badge">${ratio}x</span></td>
    </tr>`;
  }).join("");
}

function renderBarChart(videos) {
  const ctx = document.getElementById("ytBarChart");
  if (!ctx) return;
  if (ytBarChart) ytBarChart.destroy();
  const top12 = [...videos].sort((a, b) => b.views - a.views).slice(0, 12);
  ytBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: top12.map(v => v.title.length > 30 ? v.title.slice(0, 30) + "..." : v.title),
      datasets: [{ label: "Vues", data: top12.map(v => v.views), backgroundColor: "rgba(200, 220, 80, 0.7)", borderRadius: 4 }]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => " " + formatCountCompact(c.raw) + " vues" } } },
      scales: { x: { ticks: { callback: v => formatCountCompact(v) }, grid: { color: "rgba(0,0,0,0.04)" } }, y: { ticks: { font: { size: 11 } } } }
    }
  });
}

function renderTimeSeries(videos, range, gran, metrics) {
  const ctx = document.getElementById("ytTimeSeriesChart");
  if (!ctx) return;
  if (ytTimeSeriesChart) ytTimeSeriesChart.destroy();

  let filtered = [...videos].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  if (range > 0) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range);
    filtered = filtered.filter(v => new Date(v.publishedAt) >= cutoff);
  }

  const buckets = {};
  filtered.forEach(v => {
    const d = new Date(v.publishedAt);
    let key;
    if (gran === "day") key = d.toISOString().slice(0, 10);
    else if (gran === "week") { const w = new Date(d); w.setDate(w.getDate() - w.getDay()); key = w.toISOString().slice(0, 10); }
    else { key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }); }
    if (!buckets[key]) buckets[key] = { views: 0, likes: 0, comments: 0 };
    buckets[key].views += v.views;
    buckets[key].likes += v.likes;
    buckets[key].comments += v.comments;
  });

  const labels = Object.keys(buckets);
  const colors = { views: "#8bc34a", likes: "#2196f3", comments: "#ff9800" };
  const datasets = metrics.map(m => ({
    label: m === "views" ? "Vues" : m === "likes" ? "Likes" : "Commentaires",
    data: labels.map(k => buckets[k][m]),
    borderColor: colors[m], backgroundColor: colors[m] + "22", fill: true, tension: 0.3, pointRadius: 3
  }));

  ytTimeSeriesChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true, position: "top" }, tooltip: { callbacks: { label: c => " " + c.dataset.label + ": " + formatCountCompact(c.raw) } } },
      scales: { x: { ticks: { maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { callback: v => formatCountCompact(v) }, grid: { color: "rgba(0,0,0,0.04)" } } }
    }
  });
}

function initYoutubeAnalysis() {
  const form = document.getElementById("youtubeAnalyzeForm");
  const input = document.getElementById("youtubeUrlInput");
  const resultsDiv = document.getElementById("youtubeResults");
  const errorMsg = document.getElementById("youtubeError");
  const analyzeBtn = document.getElementById("youtubeAnalyzeBtn");

  if (!form) return;

  const autoUrl = getParam("youtube");
  if (autoUrl) {
    input.value = autoUrl;
    setTimeout(() => form.dispatchEvent(new Event("submit")), 500);
  }

  // Chart controls
  let currentRange = 0, currentGran = "month", currentMetrics = ["views", "likes"];

  function setupControls() {
    document.querySelectorAll("#ytRangeGroup .ov-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ytRangeGroup .ov-toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentRange = parseInt(btn.dataset.range);
        renderTimeSeries(ytAllVideos, currentRange, currentGran, currentMetrics);
      });
    });
    document.querySelectorAll("#ytGranGroup .ov-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ytGranGroup .ov-toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentGran = btn.dataset.gran;
        renderTimeSeries(ytAllVideos, currentRange, currentGran, currentMetrics);
      });
    });
    document.querySelectorAll("#ytMetricGroup .ov-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        currentMetrics = Array.from(document.querySelectorAll("#ytMetricGroup .ov-toggle-btn.active")).map(b => b.dataset.metric);
        if (currentMetrics.length === 0) { btn.classList.add("active"); currentMetrics = [btn.dataset.metric]; }
        renderTimeSeries(ytAllVideos, currentRange, currentGran, currentMetrics);
      });
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    resultsDiv.classList.add("hidden");
    errorMsg.classList.add("hidden");
    analyzeBtn.disabled = true;
    const originalBtn = analyzeBtn.innerHTML;
    analyzeBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Analyse...';

    try {
      const statsRes = await fetch("/api/youtube/stats", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url })
      });
      const data = await statsRes.json();
      if (!statsRes.ok) throw new Error(data.error || "Erreur lors de l'analyse");

      const { channel, kpis, allVideos } = data;
      ytAllVideos = allVideos;

      // Channel header
      document.getElementById("channelAvatar").src = channel.thumbnail;
      document.getElementById("channelTitle").textContent = channel.title;
      document.getElementById("channelDescription").textContent = channel.description?.slice(0, 200) || "";

      // KPIs
      document.getElementById("statsSubs").textContent = formatCountCompact(kpis.subscribers);
      document.getElementById("statsVideosLong").textContent = kpis.videoCountLong;
      document.getElementById("statsTotalViews").textContent = formatCountCompact(kpis.totalViews);
      document.getElementById("statsAvgViews").textContent = formatCountCompact(kpis.avgViews);
      document.getElementById("statsEngagement").textContent = kpis.avgEngagement + "%";
      document.getElementById("statsMedianViews").textContent = formatCountCompact(kpis.medianViews);

      // Top 10 by views
      const top10 = [...allVideos].sort((a, b) => b.views - a.views).slice(0, 10);
      document.getElementById("ytTopTable").innerHTML = buildTableRows(top10, kpis.avgViews);

      // Outliers by ratio
      const withRatio = allVideos.map(v => ({ ...v, ratio: kpis.avgViews > 0 ? v.views / kpis.avgViews : 0 }));
      const outliers = withRatio.sort((a, b) => b.ratio - a.ratio).slice(0, 10);
      document.getElementById("ytOutliersTable").innerHTML = buildTableRows(outliers, kpis.avgViews);

      // Charts
      renderBarChart(allVideos);
      setupControls();
      renderTimeSeries(allVideos, currentRange, currentGran, currentMetrics);

      resultsDiv.classList.remove("hidden");

      // AI analysis
      try {
        const aiRes = await fetch("/api/mistral/analyze", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stats: { ...channel, videoCountLong: kpis.videoCountLong, avgViews: kpis.avgViews, avgEngagement: kpis.avgEngagement, medianViews: kpis.medianViews },
            channelName: channel.title,
            topVideos: top10.slice(0, 5).map(v => v.title),
          })
        });
        const aiData = await aiRes.json();
        if (aiRes.ok && aiData.analysis) {
          const aiDiv = document.getElementById("aiContent");
          if (aiDiv) aiDiv.innerHTML = aiData.analysis;
        }
      } catch(e) { console.warn("AI analysis failed:", e); }

    } catch (err) {
      console.error(err);
      errorMsg.textContent = err.message;
      errorMsg.classList.remove("hidden");
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = originalBtn || '<span>Analyser</span>';
    }
  });
}

// Init when DOM loaded
document.addEventListener("DOMContentLoaded", initYoutubeAnalysis);

// ===== Performance: Top Performing + Needs Attention =====
function populatePerfVideoLists(allVideos, kpis) {
  const topList = document.getElementById("perfTopList");
  const bottomList = document.getElementById("perfBottomList");
  if (!topList || !bottomList) return;

  const sorted = [...allVideos].sort((a, b) => b.views - a.views);
  const top5 = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5).reverse();

  function formatDuration(dur) {
    if (!dur) return "";
    const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return dur;
    const h = match[1] ? match[1] + ":" : "";
    const m = (match[2] || "0").padStart(2, "0");
    const s = (match[3] || "0").padStart(2, "0");
    return h + m + ":" + s;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return "";
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return "Aujourd'hui";
    if (days === 1) return "Hier";
    if (days < 30) return days + "j";
    if (days < 365) return Math.floor(days / 30) + " mois";
    return Math.floor(days / 365) + " an" + (Math.floor(days / 365) > 1 ? "s" : "");
  }

  function buildItem(video, isBottom) {
    const ratio = kpis.avgViews > 0 ? ((video.views / kpis.avgViews) * 100).toFixed(0) : 0;
    const thumbUrl = video.thumbnailUrl || "";
    const thumbHtml = thumbUrl
      ? `<img src="${thumbUrl}" alt="" loading="lazy">`
      : `<div style="width:100%;height:100%;background:#e4e4e7"></div>`;

    const warnHtml = isBottom && kpis.avgViews > 0
      ? `<div class="perf-video-warn">Sous la moyenne de ${ratio > 0 ? (100 - parseInt(ratio)) : "—"}%</div>`
      : "";

    return `
      <div class="perf-video-item">
        <div class="perf-video-thumb">
          ${thumbHtml}
          <span class="perf-video-thumb-badge">${formatCountCompact(video.views)}</span>
        </div>
        <div class="perf-video-info">
          <strong title="${video.title || ""}">${(video.title || "Sans titre").slice(0, 50)}${(video.title || "").length > 50 ? "…" : ""}</strong>
          <span>${timeAgo(video.publishedAt)}</span>
          ${warnHtml}
        </div>
        <div class="perf-video-stats">
          <span>${formatCountCompact(video.likes || 0)} likes</span>
          <span>${formatDuration(video.duration)}</span>
        </div>
      </div>
    `;
  }

  topList.innerHTML = top5.map(v => buildItem(v, false)).join("");
  bottomList.innerHTML = bottom5.map(v => buildItem(v, true)).join("");
}
