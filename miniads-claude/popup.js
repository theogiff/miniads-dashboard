// Ouvrir directement la fenêtre de prévisualisation
document.getElementById('openPreview').addEventListener('click', () => {
  const width = 1400;
  const height = 900;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  chrome.windows.create({
    url: 'preview.html',
    type: 'popup',
    width: width,
    height: height,
    left: Math.round(left),
    top: Math.round(top)
  });
});