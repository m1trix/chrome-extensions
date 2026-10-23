# Tasks++

A Manifest V3 browser extension for Chrome and Microsoft Edge. Plain JavaScript, no build step.

## Structure

```
manifest.json                   Extension manifest (MV3)
icons/                          Toolbar / store icons (16, 32, 48, 128)
src/background/service-worker.js  Background service worker (ES module)
src/content/content.js          Content script injected into matched pages
src/sidepanel/                  Side panel, opened from the toolbar icon (HTML/CSS/JS)
src/options/                    Options page
```

## Load it locally

**Chrome:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick this folder.

**Edge:** open `edge://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick this folder.

After editing files, click the reload icon on the extension card. Content script changes also need the page to be refreshed.

### Debugging

- Side panel: right-click inside the open panel → **Inspect**.
- Service worker: click the **service worker** link on the extension card.
- Content script: the page's own DevTools console.

## Package

```sh
npm run package
```

This creates `tasks-plus-plus.zip`, which you can upload to the
[Chrome Web Store](https://chrome.google.com/webstore/devconsole) or
[Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge).
