// IdeaSpeak → Lovable Bridge
// Listens for prompt messages from ideaspeak.dev and routes them to an open Lovable tab

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === "IDEASPEAK_PROMPT") {
    handlePromptInjection(message.prompt, sendResponse);
    return true; // keep channel open for async response
  }
});

// Also listen for internal messages (from popup or content scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "IDEASPEAK_PROMPT") {
    handlePromptInjection(message.prompt, sendResponse);
    return true;
  }
});

async function handlePromptInjection(prompt, sendResponse) {
  try {
    // Find an existing Lovable tab
    const tabs = await chrome.tabs.query({ url: ["https://lovable.dev/*", "https://*.lovable.dev/*"] });

    if (tabs.length === 0) {
      // No Lovable tab open — open one
      const newTab = await chrome.tabs.create({ url: "https://lovable.dev" });
      // Wait for it to load, then inject
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === newTab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            injectPromptIntoTab(newTab.id, prompt, sendResponse);
          }, 2000); // give page JS time to hydrate
        }
      });
    } else {
      // Use the first Lovable tab found
      const target = tabs[0];
      await chrome.tabs.update(target.id, { active: true });
      await chrome.windows.update(target.windowId, { focused: true });
      injectPromptIntoTab(target.id, prompt, sendResponse);
    }
  } catch (err) {
    console.error("IdeaSpeak extension error:", err);
    sendResponse({ success: false, error: err.message });
  }
}

function injectPromptIntoTab(tabId, prompt, sendResponse) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: injectAndExecutePrompt,
    args: [prompt]
  }, (results) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true });
    }
  });
}

// This function runs INSIDE the Lovable tab
function injectAndExecutePrompt(prompt) {
  return new Promise((resolve) => {
    const MAX_ATTEMPTS = 20;
    let attempts = 0;

    const tryInject = () => {
      attempts++;

      // Lovable uses a textarea or contenteditable — try both
      const selectors = [
        'textarea[placeholder*="idea"]',
        'textarea[placeholder*="Describe"]',
        'textarea[placeholder*="describe"]',
        'textarea[placeholder*="Build"]',
        'textarea[placeholder*="build"]',
        'textarea[placeholder*="What"]',
        'div[contenteditable="true"]',
        'textarea',
      ];

      let inputEl = null;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { inputEl = el; break; }
      }

      if (!inputEl) {
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(tryInject, 500);
        } else {
          resolve({ success: false, error: "Could not find Lovable input field" });
        }
        return;
      }

      // Focus the element
      inputEl.focus();

      // Set value depending on element type
      if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
        // React-compatible value setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
          || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(inputEl, prompt);
        } else {
          inputEl.value = prompt;
        }

        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // contenteditable div
        inputEl.innerHTML = "";
        inputEl.textContent = prompt;
        inputEl.dispatchEvent(new InputEvent("input", { bubbles: true, data: prompt }));
      }

      // Wait a beat then auto-submit
      setTimeout(() => {
        // Try to find and click a submit button
        const submitSelectors = [
          'button[type="submit"]',
          'button[aria-label*="send" i]',
          'button[aria-label*="submit" i]',
          'button[aria-label*="generate" i]',
          'button[aria-label*="build" i]',
          'form button:last-of-type',
        ];

        let submitBtn = null;
        for (const sel of submitSelectors) {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled) { submitBtn = btn; break; }
        }

        if (submitBtn) {
          submitBtn.click();
          resolve({ success: true, method: "button_click" });
        } else {
          // Fallback: simulate Enter key on the input
          inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
          inputEl.dispatchEvent(new KeyboardEvent("keyup",   { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
          resolve({ success: true, method: "enter_key" });
        }
      }, 600);
    };

    tryInject();
  });
}
