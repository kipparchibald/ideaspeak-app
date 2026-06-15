/**
 * ideaspeak-bridge.js
 * 
 * Include this in your ideaspeak.dev React app.
 * Call sendToLovable(prompt) when the user's prompt is ready.
 * 
 * Usage:
 *   import { sendToLovable, isBridgeInstalled } from './ideaspeak-bridge';
 * 
 *   const installed = await isBridgeInstalled();
 *   if (installed) {
 *     await sendToLovable(finalPrompt);
 *   }
 */

// The extension ID — update this after publishing to Chrome Web Store
// During development, find it at chrome://extensions after loading unpacked
const EXTENSION_ID = "YOUR_EXTENSION_ID_HERE";

/**
 * Check if the IdeaSpeak extension is installed and active.
 */
export async function isBridgeInstalled() {
  return new Promise((resolve) => {
    if (!window.chrome?.runtime?.sendMessage) {
      resolve(false);
      return;
    }
    try {
      chrome.runtime.sendMessage(EXTENSION_ID, { type: "PING" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(response?.pong === true);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Send the final prompt to Lovable via the extension.
 * The extension will find/open a Lovable tab and auto-execute it.
 * 
 * @param {string} prompt - The refined prompt to send
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendToLovable(prompt) {
  return new Promise((resolve) => {
    if (!window.chrome?.runtime?.sendMessage) {
      resolve({ success: false, error: "Extension not available" });
      return;
    }

    try {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: "IDEASPEAK_PROMPT", prompt },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: true });
          }
        }
      );
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}
