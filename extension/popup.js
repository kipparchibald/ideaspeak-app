// popup.js

async function checkLovableTab() {
  const tabs = await chrome.tabs.query({ url: ["https://lovable.dev/*", "https://*.lovable.dev/*"] });
  const badge = document.getElementById("lovable-status");
  if (tabs.length > 0) {
    badge.textContent = "OPEN";
    badge.className = "badge active";
  } else {
    badge.textContent = "NOT OPEN";
    badge.className = "badge waiting";
  }
}

// Load stats from storage
chrome.storage.local.get(["promptCount", "lastPrompt"], (data) => {
  document.getElementById("prompt-count").textContent = data.promptCount || 0;
  if (data.lastPrompt) {
    const shortened = data.lastPrompt.length > 120
      ? data.lastPrompt.slice(0, 120) + "..."
      : data.lastPrompt;
    document.getElementById("last-prompt-text").textContent = shortened;
  }
});

document.getElementById("open-lovable").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://lovable.dev" });
});

checkLovableTab();
