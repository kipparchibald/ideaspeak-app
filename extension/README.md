# IdeaSpeak → Lovable Chrome Extension

Automatically injects and executes prompts from ideaspeak.dev into Lovable — no copy/paste, no Enter key needed.

**For best results (better than default Lovable):** Use the xAI-powered Voice Refiner + Lovable-Optimized-Refined-Prompt.md from `~/Desktop/ideaspeak-xai/`. This turns raw spoken ideas into prompts that make Lovable output significantly higher quality, more beautiful, and more production-ready. See the prompts for the full native xAI IdeaSpeak agent too.

---

## Files

```
ideaspeak-extension/
├── manifest.json          # Extension config (Manifest V3)
├── background.js          # Service worker — routes prompts to Lovable tab
├── lovable-injector.js    # Content script running on lovable.dev
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── ideaspeak-bridge.js    # Import this into your ideaspeak.dev React app
└── icons/                 # Add icon16.png, icon48.png, icon128.png here
```

---

## Installation (Development)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `ideaspeak-extension/` folder
5. The extension will appear — note the **Extension ID** shown under its name

---

## Connect to ideaspeak.dev

1. Open `ideaspeak-bridge.js`
2. Replace `"YOUR_EXTENSION_ID_HERE"` with your actual Extension ID from step 5 above
3. Import and use in your React app:

```javascript
import { sendToLovable, isBridgeInstalled } from './ideaspeak-bridge';

// Check if extension is installed
const installed = await isBridgeInstalled();

if (installed) {
  // This opens/focuses Lovable and auto-executes the prompt
  const result = await sendToLovable(finalPrompt);
  console.log(result); // { success: true }
} else {
  // Show user a banner to install the extension
  showInstallPrompt();
}
```

---

## How It Works

```
User speaks idea (voice-native)
      ↓
ideaspeak.dev transcribes + runs xAI Voice Refiner → produces rich structured brief + Lovable-optimized prompt (see ~/Desktop/ideaspeak-xai/ prompts for the kick-ass versions)
      ↓
sendToLovable(optimizedPrompt) called
      ↓
Extension background.js receives message
      ↓
Finds/opens a Lovable tab
      ↓
lovable-injector.js injects text into Lovable's input
      ↓
Clicks submit button (or sends Enter key)
      ↓
Lovable starts building — no user action needed ✓
```

---

## Add Icons

Add PNG icons to the `icons/` folder:
- `icon16.png` — 16×16px
- `icon48.png` — 48×48px  
- `icon128.png` — 128×128px

You can use any mic or speech bubble icon. Free options: [Flaticon](https://flaticon.com), [Icons8](https://icons8.com)

---

## Publishing to Chrome Web Store

When ready to ship:
1. Zip the extension folder
2. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Upload the zip
4. After approval, update `EXTENSION_ID` in `ideaspeak-bridge.js` to the published ID
5. Update `externally_connectable` in `manifest.json` with the published extension ID

---

## Troubleshooting

**Lovable input not found**: Lovable may have updated their UI. Open DevTools on lovable.dev and inspect the prompt textarea to find the right selector, then update `lovable-injector.js`.

## Using with the local IdeaSpeak demo

Open /Users/kipp/Desktop/ideaspeak/index.html in Chrome. 
It includes the bridge and will detect this extension. 
You can speak an idea, have it refined using the real prompts, build a live preview, then click "Send to Lovable" — the extension will auto-inject the highly-optimized prompt.

**Extension ID mismatch**: Every time you reload an unpacked extension, the ID may change. Re-copy it from chrome://extensions.

**Prompt not executing**: Some Lovable pages require login first. Make sure you're logged into Lovable before sending a prompt.
