import { debounce } from './dom.js';

export function onYouTubeReady(callback) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    requestAnimationFrame(() => callback());
  } else {
    window.addEventListener('DOMContentLoaded', () => callback(), { once: true });
  }
}

export function watchNavigation(callback) {
  const debounced = debounce(callback, 200);
  const app = document.querySelector('ytd-app');
  if (app) {
    const observer = new MutationObserver(() => {
      debounced();
    });
    observer.observe(app, { childList: true, subtree: true });
  }
  const handler = () => debounced();
  window.addEventListener('yt-page-data-updated', handler);
  window.addEventListener('yt-navigate-finish', handler);
  window.addEventListener('popstate', handler);
  window.addEventListener('yt-action', handler);
  debounced();
  return () => {
    window.removeEventListener('yt-page-data-updated', handler);
    window.removeEventListener('yt-navigate-finish', handler);
    window.removeEventListener('popstate', handler);
    window.removeEventListener('yt-action', handler);
  };
}
