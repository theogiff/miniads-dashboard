const toggle = document.getElementById("enabledToggle");
const openYT = document.getElementById("openYT");

chrome.storage.local.get(["miniads_enabled"], (res) => {
  toggle.checked = res.miniads_enabled !== false; // par défaut: true
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ miniads_enabled: toggle.checked });
});

openYT.addEventListener("click", () => {
  // rien de spécial, juste un lien
});
