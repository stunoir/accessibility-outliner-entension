# Accessibility Outliner

A simple Chrome extension (Manifest V3) that visually outlines accessibility issues on the current page.

## Loading the extension

1. Open Chrome and go to `chrome://extensions`.
2. Toggle "Developer mode" on (top right).
3. Click "Load unpacked".
4. Select this folder.

The Accessibility Outliner icon will appear in the toolbar. Pin it for easy access.

## Adding or editing tools

All tools live in `src/outliner-tools.js` as an array of objects. Each entry has:

- `name` - a stable internal identifier, used for logging
- `label` - the text shown on the button
- `fn` - the function to execute against the active tab

The function runs in the target page's isolated world via `chrome.scripting.executeScript`. It has full access to the page's DOM, but it cannot reference variables from `popup.js`, import modules, or call any `chrome.*` API. Anything `fn` needs must be defined inside `fn` itself.

To add a new tool, append another object to the array. To remove one, delete its entry.

## Known limitations

Chrome blocks scripting on certain pages. When you click a tool on one of these, the popup shows an inline warning ("This page can't be scripted by extensions.") instead of running. Affected pages include:

- `chrome://` pages (settings, extensions, new tab override, and similar)
- The Chrome Web Store
- Other extension pages (`chrome-extension://...`)

## File overview

- `manifest.json` - extension metadata, permissions, and popup entry point
- `src/popup.html`, `src/popup.css`, `src/popup.js` - the toolbar popup UI and click handlers
- `src/outliner-tools.js` - the outliner tool config array
- `assets/` - logo and toolbar icons
