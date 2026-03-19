// Shim chrome.storage pour fonctionner hors extension (navigateur web)
if (typeof chrome === 'undefined' || !chrome.storage) {
  window.chrome = window.chrome || {};
  chrome.storage = {
    local: {
      get(keys, cb) {
        try {
          const data = JSON.parse(localStorage.getItem('miniads_preview') || '{}');
          cb(data);
        } catch(e) { cb({}); }
      },
      set(obj) {
        try {
          const data = JSON.parse(localStorage.getItem('miniads_preview') || '{}');
          Object.assign(data, obj);
          localStorage.setItem('miniads_preview', JSON.stringify(data));
        } catch(e) {}
      },
      clear() {
        localStorage.removeItem('miniads_preview');
      }
    }
  };
}

// YouTube API key is proxied through the server — no client-side key
const YOUTUBE_API_KEY = '';
const incomingParams = getIncomingParams();
const DEFAULT_TITLE = 'Votre titre de vidéo';
const DEFAULT_CHANNEL = 'Votre chaîne YouTube';

let currentThumbnail = null;
let currentTitle = DEFAULT_TITLE;
let currentChannel = DEFAULT_CHANNEL;
let customVideoPosition = 0;
let allVideos = [];
let selectedChannelData = null;
let selectedVideoSources = [];

// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function getIncomingParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    thumbnail: params.get('thumb') || null,
    title: params.get('title') || null,
    channel: params.get('channel') || null
  };
}

function initializeApp() {
  // Charger les données sauvegardées
  loadSavedData();
  
  // Initialiser les event listeners
  setupEventListeners();
}

function openModal(modalId, inputId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('show'));
  document.body.classList.add('modal-open');
  
  if (inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      setTimeout(() => input.focus(), 120);
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
    const hasOpenModal = Array.from(document.querySelectorAll('.search-modal-overlay')).some((m) =>
      m.classList.contains('show')
    );
    if (!hasOpenModal) {
      document.body.classList.remove('modal-open');
    }
  }, 180);
}

function loadSavedData() {
  let normalizedDefaults = false;
  chrome.storage.local.get(['thumbnail', 'title', 'channel', 'channelData', 'theme', 'view', 'videoSources'], (result) => {
    const incoming = incomingParams || {};
    if (incoming.thumbnail || result.thumbnail) {
      currentThumbnail = incoming.thumbnail || result.thumbnail;
      showThumbnail(currentThumbnail);
    }
    if (incoming.title || result.title) {
      const storedTitle = result.title === 'Your New Video Title' ? null : result.title;
      if (result.title === 'Your New Video Title') normalizedDefaults = true;
      currentTitle = incoming.title || storedTitle || DEFAULT_TITLE;
      const titleInput = document.getElementById('titleInput');
      if (titleInput) titleInput.value = currentTitle;
    } else {
      currentTitle = DEFAULT_TITLE;
      const titleInput = document.getElementById('titleInput');
      if (titleInput) titleInput.value = currentTitle;
    }
    if (result.channel) {
      const storedChannel = result.channel === 'Your Channel' ? null : result.channel;
      if (result.channel === 'Your Channel') normalizedDefaults = true;
      currentChannel = storedChannel || DEFAULT_CHANNEL;
    } else {
      currentChannel = DEFAULT_CHANNEL;
    }
    const placeholder = document.getElementById('channelSearchPlaceholder');
    if (placeholder) placeholder.textContent = currentChannel === DEFAULT_CHANNEL ? 'Rechercher une chaîne...' : currentChannel;
    if (result.channelData) {
      selectedChannelData = result.channelData;
      showChannelPreview(result.channelData, 'selectedChannelPreview');
    }
    if (Array.isArray(result.videoSources)) {
      selectedVideoSources = result.videoSources;
      renderVideoSourcePreviews();
      updateVideoSourcePlaceholder();
    }
    
    // Thème
    if (result.theme === 'dark') {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
      const toggleSwitch = document.getElementById('toggleSwitch');
      const themeLabel = document.querySelector('.theme-toggle span');
      if (toggleSwitch) toggleSwitch.classList.remove('active');
      if (themeLabel) themeLabel.textContent = '🌙 Mode sombre';
    } else {
      document.body.classList.add('light-mode');
      const toggleSwitch = document.getElementById('toggleSwitch');
      const themeLabel = document.querySelector('.theme-toggle span');
      if (toggleSwitch) toggleSwitch.classList.add('active');
      if (themeLabel) themeLabel.textContent = '☀️ Mode clair';
    }
    
    if (result.view) {
      setView(result.view);
    }
    
    // Créer le feed initial
    createVideoFeed();
    if (incoming.thumbnail || incoming.title || incoming.channel) {
      saveData();
    }
    if (normalizedDefaults) {
      saveData();
    }
  });
}

function setupEventListeners() {
  // Upload de miniature
  const thumbnailContainer = document.getElementById('thumbnailContainer');
  const thumbnailInput = document.getElementById('thumbnailInput');
  
  if (thumbnailContainer && thumbnailInput) {
    thumbnailContainer.addEventListener('click', () => {
      thumbnailInput.click();
    });
    
    thumbnailInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          currentThumbnail = event.target.result;
          showThumbnail(currentThumbnail);
          saveData();
          refreshPreview();
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  // Titre
  const titleInput = document.getElementById('titleInput');
  if (titleInput) {
    titleInput.addEventListener('input', (e) => {
      currentTitle = e.target.value || 'Votre titre de vidéo';
      saveData();
      refreshPreview();
    });
  }
  
  // Boutons de recherche de chaînes
  const channelSearchBtn = document.getElementById('channelSearchBtn');
  if (channelSearchBtn) {
    channelSearchBtn.addEventListener('click', () => {
      openModal('channelSearchModal', 'channelSearchInput');
    });
  }
  
  const videoSourceSearchBtn = document.getElementById('videoSourceSearchBtn');
  if (videoSourceSearchBtn) {
    videoSourceSearchBtn.addEventListener('click', () => {
      openModal('videoSourceSearchModal', 'videoSourceSearchInput');
    });
  }

  document.querySelectorAll('.label-action').forEach((label) => {
    label.addEventListener('click', () => {
      const modalId = label.dataset.modalId;
      const inputId = label.dataset.inputId;
      openModal(modalId, inputId);
    });
  });
  
  // Fermer les modals
  document.querySelectorAll('.search-modal-overlay').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  document.querySelectorAll('.modal-close').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.closeModal;
      closeModal(targetId);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('channelSearchModal');
      closeModal('videoSourceSearchModal');
    }
  });
  
  // Recherche dans les modals
  const channelSearchInput = document.getElementById('channelSearchInput');
  if (channelSearchInput) {
    let timeout;
    channelSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      const resultsContainer = document.getElementById('channelSearchResults');
      
      if (query.length < 2) {
        resultsContainer.innerHTML = `
          <div class="results-empty">
            <div class="empty-icon">📺</div>
            <div class="empty-text">Recherchez une chaîne YouTube</div>
          </div>
        `;
        return;
      }
      
      resultsContainer.innerHTML = `
        <div class="results-empty">
          <div class="empty-icon">⏳</div>
          <div class="empty-text">Recherche en cours...</div>
        </div>
      `;
      
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        searchChannelsInModal(query, resultsContainer, (channel) => {
          selectedChannelData = channel;
          currentChannel = channel.title;
          const placeholder = document.getElementById('channelSearchPlaceholder');
          if (placeholder) placeholder.textContent = channel.title;
          showChannelPreview(channel, 'selectedChannelPreview');
          closeModal('channelSearchModal');
          channelSearchInput.value = '';
          saveData();
          refreshPreview();
        });
      }, 300);
    });
  }
  
  const videoSourceSearchInput = document.getElementById('videoSourceSearchInput');
  if (videoSourceSearchInput) {
    let timeout;
    videoSourceSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      const resultsContainer = document.getElementById('videoSourceSearchResults');
      
      if (query.length < 2) {
        resultsContainer.innerHTML = `
          <div class="results-empty">
            <div class="empty-icon">📺</div>
            <div class="empty-text">Recherchez une chaîne YouTube</div>
          </div>
        `;
        return;
      }
      
      resultsContainer.innerHTML = `
        <div class="results-empty">
          <div class="empty-icon">⏳</div>
          <div class="empty-text">Recherche en cours...</div>
        </div>
      `;
      
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        searchChannelsInModal(query, resultsContainer, async (channel) => {
          await addVideoSource(channel);
          closeModal('videoSourceSearchModal');
          videoSourceSearchInput.value = '';
        });
      }, 300);
    });
  }
  
  // Position
  const randomPosBtn = document.getElementById('randomPosBtn');
  if (randomPosBtn) {
    randomPosBtn.addEventListener('click', () => {
      if (allVideos.length > 0) {
        customVideoPosition = Math.floor(Math.random() * (allVideos.length + 1));
        renderVideoGrid();
      }
    });
  }
  
  const topPosBtn = document.getElementById('topPosBtn');
  if (topPosBtn) {
    topPosBtn.addEventListener('click', () => {
      customVideoPosition = 0;
      renderVideoGrid();
    });
  }
  
  // Vue
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setView(btn.dataset.view);
      saveData();
    });
  });
  
  // Thème
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const toggle = document.getElementById('toggleSwitch');
      const label = document.querySelector('.theme-toggle span');
      
      document.body.classList.toggle('dark-mode');
      document.body.classList.toggle('light-mode');
      if (toggle) toggle.classList.toggle('active');
      
      if (document.body.classList.contains('dark-mode')) {
        if (label) label.textContent = '🌙 Mode sombre';
      } else {
        if (label) label.textContent = '☀️ Mode clair';
      }
      
      saveData();
    });
  }
  
  // Boutons
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      customVideoPosition = 0;
      await createVideoFeed(true);
    });
  }
  
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const userThumbnail = document.getElementById('userThumbnail');
      const uploadPrompt = document.getElementById('uploadPrompt');
      const thumbnailContainer = document.getElementById('thumbnailContainer');
      const thumbnailInput = document.getElementById('thumbnailInput');
      
      currentThumbnail = null;
      currentTitle = 'Votre titre de vidéo';
      currentChannel = 'Votre chaîne YouTube';
      customVideoPosition = 0;
      selectedChannelData = null;
      selectedVideoSources = [];
      allVideos = [];
      
      if (userThumbnail) userThumbnail.style.display = 'none';
      if (uploadPrompt) uploadPrompt.classList.remove('hidden');
      if (thumbnailContainer) thumbnailContainer.classList.remove('has-image');
      
      const titleInput = document.getElementById('titleInput');
      if (titleInput) titleInput.value = '';
      
      const channelPlaceholder = document.getElementById('channelSearchPlaceholder');
      if (channelPlaceholder) channelPlaceholder.textContent = 'Rechercher une chaîne...';
      
      const videoSourcePlaceholder = document.getElementById('videoSourceSearchPlaceholder');
      if (videoSourcePlaceholder) videoSourcePlaceholder.textContent = 'Rechercher une chaîne...';
      
      const selectedChannelPreview = document.getElementById('selectedChannelPreview');
      if (selectedChannelPreview) selectedChannelPreview.innerHTML = '';
      
      const selectedVideoSourcePreview = document.getElementById('selectedVideoSourcePreview');
      if (selectedVideoSourcePreview) selectedVideoSourcePreview.innerHTML = '';
      renderVideoSourcePreviews();
      updateVideoSourcePlaceholder();
      
      if (thumbnailInput) thumbnailInput.value = '';
      
      chrome.storage.local.clear();
      await createVideoFeed(true);
    });
  }
}

function showThumbnail(data) {
  const userThumbnail = document.getElementById('userThumbnail');
  const uploadPrompt = document.getElementById('uploadPrompt');
  const thumbnailContainer = document.getElementById('thumbnailContainer');
  
  if (userThumbnail) {
    userThumbnail.src = data;
    userThumbnail.style.display = 'block';
  }
  if (uploadPrompt) uploadPrompt.classList.add('hidden');
  if (thumbnailContainer) thumbnailContainer.classList.add('has-image');
}

async function searchChannelsInModal(query, resultsContainer, onSelect) {
  try {
    const response = await fetch(
      `/api/youtube/proxy?endpoint=search&part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=10`
    );
    
    if (!response.ok) {
      resultsContainer.innerHTML = `
        <div class="results-empty">
          <div class="empty-icon">❌</div>
          <div class="empty-text">Erreur lors de la recherche</div>
        </div>
      `;
      return;
    }
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      resultsContainer.innerHTML = `
        <div class="results-empty">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">Aucune chaîne trouvée</div>
        </div>
      `;
      return;
    }
    
    const channelIds = data.items.map(item => item.snippet.channelId).join(',');
    const statsResponse = await fetch(
      `/api/youtube/proxy?endpoint=channels&part=statistics&id=${channelIds}`
    );
    
    const statsData = await statsResponse.json();
    const statsMap = {};
    statsData.items?.forEach(item => {
      statsMap[item.id] = item.statistics;
    });
    
    resultsContainer.innerHTML = '';
    
    data.items.forEach(item => {
      const channel = {
        id: item.snippet.channelId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.default.url,
        subscribers: statsMap[item.snippet.channelId]?.subscriberCount || '0'
      };
      
      const div = document.createElement('div');
      div.className = 'result-item';
      div.innerHTML = `
        <img src="${channel.thumbnail}" alt="${channel.title}" class="result-avatar">
        <div class="result-info">
          <div class="result-name">${channel.title}</div>
          <div class="result-subscribers">${formatSubscribers(channel.subscribers)} abonnés</div>
        </div>
      `;
      
      div.addEventListener('click', () => onSelect(channel));
      resultsContainer.appendChild(div);
    });
  } catch (error) {
    console.error('Erreur recherche chaînes:', error);
    resultsContainer.innerHTML = `
      <div class="results-empty">
        <div class="empty-icon">❌</div>
        <div class="empty-text">Erreur lors de la recherche</div>
      </div>
    `;
  }
}

function formatSubscribers(count) {
  const num = parseInt(count);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return isNaN(num) ? '0' : num.toString();
}

function updateVideoSourcePlaceholder() {
  const placeholder = document.getElementById('videoSourceSearchPlaceholder');
  if (!placeholder) return;
  
  if (selectedVideoSources.length === 0) {
    placeholder.textContent = 'Rechercher une chaîne...';
  } else if (selectedVideoSources.length === 1) {
    placeholder.textContent = selectedVideoSources[0].title;
  } else {
    placeholder.textContent = `${selectedVideoSources.length} chaînes sélectionnées`;
  }
}

function renderVideoSourcePreviews() {
  const container = document.getElementById('selectedVideoSourcePreview');
  if (!container) return;
  
  if (selectedVideoSources.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  const list = document.createElement('div');
  list.className = 'channel-preview-list';
  
  selectedVideoSources.forEach((channel) => {
    const item = document.createElement('div');
    item.className = 'channel-preview';
    item.innerHTML = `
      <img src="${channel.thumbnail}" alt="${channel.title}" class="channel-preview-avatar">
      <div class="channel-preview-info">
        <div class="channel-preview-name">${channel.title}</div>
        <div class="channel-preview-subscribers">${formatSubscribers(channel.subscribers)} abonnés</div>
      </div>
      <button class="channel-preview-remove" data-remove-channel="${channel.id}">×</button>
    `;
    list.appendChild(item);
  });
  
  container.innerHTML = '';
  container.appendChild(list);
  
  container.querySelectorAll('[data-remove-channel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.removeChannel;
      await removeVideoSource(id);
    });
  });
}

async function addVideoSource(channel) {
  const exists = selectedVideoSources.some((c) => c.id === channel.id);
  if (exists) return;
  
  selectedVideoSources.push(channel);
  updateVideoSourcePlaceholder();
  renderVideoSourcePreviews();
  saveData();
  await createVideoFeed(true);
}

async function removeVideoSource(channelId) {
  selectedVideoSources = selectedVideoSources.filter((c) => c.id !== channelId);
  updateVideoSourcePlaceholder();
  renderVideoSourcePreviews();
  saveData();
  await createVideoFeed(true);
}

function showChannelPreview(channel, previewId, showRemove = false) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  
  const removeBtn = showRemove ? `<button class="channel-preview-remove" onclick="removeVideoSource('${channel.id}')">×</button>` : '';
  
  preview.innerHTML = `
    <div class="channel-preview">
      <img src="${channel.thumbnail}" alt="${channel.title}" class="channel-preview-avatar">
      <div class="channel-preview-info">
        <div class="channel-preview-name">${channel.title}</div>
        <div class="channel-preview-subscribers">${formatSubscribers(channel.subscribers)} abonnés</div>
      </div>
      ${removeBtn}
    </div>
  `;
}

window.removeVideoSource = removeVideoSource;

function saveData() {
  const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
  const activeViewBtn = document.querySelector('.view-btn.active');
  const currentView = activeViewBtn ? activeViewBtn.dataset.view : 'feed';
  
  chrome.storage.local.set({
    thumbnail: currentThumbnail,
    title: currentTitle,
    channel: currentChannel,
    channelData: selectedChannelData,
    videoSources: selectedVideoSources,
    theme: currentTheme,
    view: currentView
  });
}

function setView(view) {
  document.body.classList.remove('mobile-view', 'tab-view');
  if (view === 'mobile') {
    document.body.classList.add('mobile-view');
  } else if (view === 'tab') {
    document.body.classList.add('tab-view');
  }
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

function renderVideoGrid() {
  const grid = document.getElementById('videoGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  const customCard = createVideoCard({
    thumbnail: currentThumbnail,
    title: currentTitle,
    channel: currentChannel,
    channelAvatar: selectedChannelData?.thumbnail,
    views: '0 vues',
    time: 'maintenant',
    duration: '0:00',
    isCustom: true
  });
  
  allVideos.forEach((video, index) => {
    if (index === customVideoPosition) {
      grid.appendChild(customCard);
    }
    grid.appendChild(video);
  });
  
  if (customVideoPosition >= allVideos.length) {
    grid.appendChild(customCard);
  }
}

function refreshPreview() {
  renderVideoGrid();
}

async function fetchVideosForChannel(channelId) {
  const searchResponse = await fetch(
    `/api/youtube/proxy?endpoint=search&part=snippet&channelId=${channelId}&order=date&type=video&maxResults=50&rnd=${Math.random()}`
  );

  if (!searchResponse.ok) {
    console.error('Erreur API YouTube:', searchResponse.status);
    return null;
  }

  const searchData = await searchResponse.json();
  const videoIds = searchData.items.map((item) => item.id.videoId).filter(Boolean).join(',');
  if (!videoIds) return [];

  const detailsResponse = await fetch(
    `/api/youtube/proxy?endpoint=videos&part=snippet,contentDetails,statistics&id=${videoIds}&rnd=${Math.random()}`
  );

  if (!detailsResponse.ok) {
    console.error('Erreur détails vidéos:', detailsResponse.status);
    return null;
  }

  const data = await detailsResponse.json();
  return data.items || [];
}

async function fetchYouTubeVideos() {
  try {
    if (selectedVideoSources.length > 0) {
      const aggregated = [];
      for (const source of selectedVideoSources) {
        const videos = await fetchVideosForChannel(source.id);
        if (videos && videos.length > 0) {
          aggregated.push(...videos);
        }
      }
      return aggregated;
    }

    const url = `/api/youtube/proxy?endpoint=videos&part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=FR&maxResults=50&rnd=${Math.random()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Erreur API YouTube:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.items;
  } catch (error) {
    console.error('Erreur lors de la récupération des vidéos:', error);
    return null;
  }
}

function parseDurationSeconds(duration) {
  const safeDuration = duration || 'PT0M0S';
  const match = safeDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return parseInt(match[1] || 0) * 3600 + parseInt(match[2] || 0) * 60 + parseInt(match[3] || 0);
}

function isLongVideo(video) {
  return parseDurationSeconds(video.contentDetails?.duration) >= 600;
}

function formatDuration(duration) {
  const safeDuration = duration || 'PT0M0S';
  const match = safeDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatViews(views) {
  const num = parseInt(views);
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}

function formatTimeAgo(publishedAt) {
  const now = new Date();
  const published = new Date(publishedAt);
  const diffMs = now - published;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "1 jour";
  if (diffDays < 7) return `${diffDays} jours`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} semaine${Math.floor(diffDays / 7) > 1 ? 's' : ''}`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} mois`;
  return `${Math.floor(diffDays / 365)} an${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function createVideoFeed(forceShuffle = false) {
  allVideos = [];
  
  const youtubeVideos = await fetchYouTubeVideos();
  
  if (youtubeVideos && youtubeVideos.length > 0) {
    const longVideosOnly = youtubeVideos.filter(isLongVideo);
    const primaryShuffle = shuffleArray(longVideosOnly);
    const videosToShow = forceShuffle ? shuffleArray(primaryShuffle) : primaryShuffle;
    
    videosToShow.forEach(video => {
      const videoCard = createVideoCard({
        thumbnail: video.snippet.thumbnails.medium.url,
        title: video.snippet.title,
        channel: video.snippet.channelTitle,
        views: formatViews(video.statistics?.viewCount || 0) + ' vues',
        time: formatTimeAgo(video.snippet.publishedAt),
        duration: formatDuration(video.contentDetails.duration),
        isCustom: false
      });
      allVideos.push(videoCard);
    });
  } else {
    console.log('Utilisation des vidéos d\'exemple (API non disponible)');
    const mockVideos = [
      { title: 'BFDIA 23 TRAILER', channel: 'Jacknjellify', views: '223K vues', time: '8 heures', duration: '2:15', bgColor: '#ff6b6b' },
      { title: 'Friday Night Funkin', channel: 'CoryxKenshin', views: '778K vues', time: '5 heures', duration: '18:42', bgColor: '#4ecdc4' },
      { title: 'Fine Chiki', channel: 'JKN VGI', views: '69K vues', time: '9 jours', duration: '3:28', bgColor: '#ffe66d' },
      { title: 'Hermitcraft 11', channel: 'Grian', views: '1.5M vues', time: '1 jour', duration: '25:14', bgColor: '#ff8b94' },
      { title: 'Outside', channel: 'Cardi B', views: '27K vues', time: '4 jours', duration: '3:51', bgColor: '#c7ceea' }
    ];
    
    shuffleArray(mockVideos).forEach(video => {
      const videoCard = createVideoCard(video);
      allVideos.push(videoCard);
    });
  }
  
  renderVideoGrid();
}

function createVideoCard(video) {
  const card = document.createElement('div');
  card.className = 'video-card';
  if (video.isCustom) card.classList.add('custom-video');
  
  const channelInitial = video.channel.charAt(0).toUpperCase();
  
  let avatarContent;
  if (video.channelAvatar) {
    avatarContent = `<img src="${video.channelAvatar}" alt="${video.channel}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
  } else {
    avatarContent = channelInitial;
  }
  
  card.innerHTML = `
    <div class="video-thumbnail">
      ${video.thumbnail 
        ? `<img src="${video.thumbnail}" alt="${video.title}">`
        : `<div style="width: 100%; height: 100%; background: ${video.bgColor || '#272727'}"></div>`
      }
      <span class="duration">${video.duration}</span>
    </div>
    <div class="video-info">
      <div class="channel-avatar" style="background: ${video.channelAvatar ? 'transparent' : getChannelColor(video.channel)}; overflow: hidden;">
        ${avatarContent}
      </div>
      <div class="video-details">
        <div class="video-title">
          ${video.title}
          ${video.isCustom ? '<span class="badge">VOTRE VIDÉO</span>' : ''}
        </div>
        <div class="video-meta">
          ${video.channel}<br>
          ${video.views} • il y a ${video.time}
        </div>
      </div>
    </div>
  `;
  
  return card;
}

function getChannelColor(channel) {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#fd79a8', '#fdcb6e', '#00b894'];
  let hash = 0;
  for (let i = 0; i < channel.length; i++) {
    hash = channel.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
