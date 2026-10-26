// Opens the organizer page when the toolbar button is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("organizer.html") });
});
