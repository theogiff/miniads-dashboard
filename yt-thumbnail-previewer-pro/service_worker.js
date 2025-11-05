const POPUP_URL = "https://www.youtube.com/";
const POPUP_W = 1280;
const POPUP_H = 800;

function openYtPopup() {
  chrome.windows.create({
    url: POPUP_URL,
    type: "popup",
    width: POPUP_W,
    height: POPUP_H,
    focused: true
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-yt-visualizer",
    title: "Ouvrir le Visualisateur YouTube",
    contexts: ["action"]
  });
});

chrome.action.onClicked.addListener(() => {
  openYtPopup();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "open-yt-visualizer") {
    openYtPopup();
  }
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "open-yt-popup") {
    openYtPopup();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ping") {
    sendResponse({ pong: true });
    return true;
  }
  if (message?.type === "update-storage") {
    chrome.storage.local.set(message.payload || {});
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
