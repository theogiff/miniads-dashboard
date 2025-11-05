export function createShadowHost(id) {
  let host = document.getElementById(id);
  if (host) {
    return host;
  }
  host = document.createElement('div');
  host.id = id;
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.height = '100vh';
  host.style.width = '0';
  host.style.zIndex = '2147483646';
  host.style.pointerEvents = 'auto';
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  document.documentElement.appendChild(host);
  host.attachShadow({ mode: 'open' });
  return host;
}

export function renderSidebar(host, html, cssText) {
  const shadowRoot = host.shadowRoot;
  shadowRoot.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = cssText;
  const wrapper = document.createElement('div');
  wrapper.className = 'ytp-sidebar-root';
  wrapper.innerHTML = html;
  shadowRoot.append(style, wrapper);
  host.style.width = '360px';
  return { shadowRoot, wrapper };
}

export function debounce(fn, wait = 100) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

export function throttle(fn, wait = 100) {
  let lastCall = 0;
  let timeout;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= wait) {
      lastCall = now;
      fn(...args);
      return;
    }
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      lastCall = Date.now();
      fn(...args);
    }, wait - (now - lastCall));
  };
}

export function formatNumber(value) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return `${value}`;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
