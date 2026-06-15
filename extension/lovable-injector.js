// lovable-injector.js
// Runs on lovable.dev — listens for prompt messages and injects them

console.log("[IdeaSpeak] Lovable injector ready");

// Listen for messages from the extension background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "INJECT_PROMPT") {
    injectPrompt(message.prompt).then(sendResponse);
    return true;
  }
});

// Also support window.postMessage for local dev / iframes
window.addEventListener("message", (event) => {
  // Only accept from ideaspeak.dev or localhost or local file
  const allowed = ["https://ideaspeak.dev", "http://localhost:3000", "http://localhost:5173", "file://", "null"];
  if (event.origin && !allowed.some(origin => event.origin.startsWith(origin))) return;

  if (event.data?.type === "IDEASPEAK_PROMPT") {
    injectPrompt(event.data.prompt);
  }
});

async function injectPrompt(prompt) {
  const selectors = [
    'textarea[placeholder*="idea" i]',
    'textarea[placeholder*="describe" i]',
    'textarea[placeholder*="build" i]',
    'textarea[placeholder*="what" i]',
    'div[contenteditable="true"]',
    'textarea',
  ];

  let inputEl = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) { inputEl = el; break; }
  }

  if (!inputEl) return { success: false, error: "Input not found" };

  inputEl.focus();

  if (inputEl.tagName === "TEXTAREA") {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter ? setter.call(inputEl, prompt) : (inputEl.value = prompt);
  } else {
    inputEl.textContent = prompt;
  }

  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));

  await new Promise(r => setTimeout(r, 500));

  // Find submit button
  const btnSelectors = [
    'button[type="submit"]',
    'button[aria-label*="send" i]',
    'button[aria-label*="generate" i]',
    'form button:last-of-type',
  ];

  for (const sel of btnSelectors) {
    const btn = document.querySelector(sel);
    if (btn && !btn.disabled) {
      btn.click();
      return { success: true };
    }
  }

  // Fallback: Enter key
  inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
  return { success: true, method: "enter_key" };
}
