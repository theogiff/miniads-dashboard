const TILE_DEFINITIONS = [
  {
    type: "rich",
    selector: "ytd-rich-item-renderer",
    scopeKey: "rich-grid"
  },
  {
    type: "video",
    selector: "ytd-video-renderer",
    scopeKey: "list"
  },
  {
    type: "grid",
    selector: "ytd-grid-video-renderer",
    scopeKey: "grid"
  },
  {
    type: "compact",
    selector: "ytd-compact-video-renderer",
    scopeKey: "compact"
  },
  {
    type: "playlist-panel",
    selector: "ytd-playlist-panel-video-renderer",
    scopeKey: "panel"
  }
];

export function getTileCandidates(root = document) {
  const tiles = [];
  TILE_DEFINITIONS.forEach((def) => {
    root.querySelectorAll(def.selector).forEach((node) => {
      if (!node.isConnected || node.offsetParent === null) {
        return;
      }
      tiles.push({ element: node, def });
    });
  });
  return tiles;
}

export function getTileIdentity(tileEl, type) {
  const link = tileEl.querySelector('a#thumbnail[href*="watch"]');
  let videoId = null;
  if (link) {
    try {
      const url = new URL(link.href);
      videoId = url.searchParams.get("v");
    } catch (err) {
      videoId = null;
    }
  }
  if (!videoId) {
    videoId = tileEl.dataset.videoId || tileEl.dataset.contextItemId || null;
  }
  if (!videoId) {
    videoId = `node-${Math.abs(hashCode(tileEl.innerHTML)).toString(36)}`;
  }
  const typeKey = type || tileEl.tagName.toLowerCase();
  return `ytp::${typeKey}::${videoId}`;
}

export function getThumbnailElements(tileEl) {
  const link = tileEl.querySelector('a#thumbnail[href*="watch"]');
  if (!link) {
    return null;
  }
  let image = link.querySelector('img#img');
  if (!image) {
    image = link.querySelector('yt-image img');
  }
  if (!image) {
    image = link.querySelector('img');
  }
  if (!image) {
    return null;
  }
  return {
    link,
    image,
    wrapper: link.closest('.ytp-thumb-wrapper') || wrapThumbnail(link)
  };
}

function wrapThumbnail(link) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('ytp-thumb-wrapper');
  const parent = link.parentElement;
  if (parent) {
    parent.insertBefore(wrapper, link);
    wrapper.appendChild(link);
  }
  return wrapper;
}

export function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function isElementInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

export function filterVisibleTiles(tiles) {
  return tiles.filter(({ element }) => isElementInViewport(element));
}

export function getFirstRowTiles(tiles) {
  if (!tiles.length) {
    return [];
  }
  let minTop = Infinity;
  tiles.forEach(({ element }) => {
    const rect = element.getBoundingClientRect();
    if (rect.top < minTop) {
      minTop = rect.top;
    }
  });
  const threshold = minTop + 5;
  return tiles.filter(({ element }) => element.getBoundingClientRect().top <= threshold);
}

export function uniqueTiles(tiles) {
  const seen = new Set();
  return tiles.filter(({ element }) => {
    if (seen.has(element)) {
      return false;
    }
    seen.add(element);
    return true;
  });
}

export const TILE_TYPES = TILE_DEFINITIONS.map((def) => def.type);
