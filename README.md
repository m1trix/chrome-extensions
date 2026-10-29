# Chrome Extensions

Browser extensions for Chrome and Microsoft Edge. Each one is Manifest V3 and written in plain JavaScript, with no
build step.

> [!NOTE]
> **Disclaimer:** these extensions are vibe-coded. Their code was written by an AI coding assistant from
> natural-language instructions, and it hasn't been reviewed line by line. Use them at your own risk.

## Extensions

| Extension | What it does |
|---|---|
| [**Tab Groups++**](tab-groups-plus-plus/) | Drag, color, merge and save your tab groups, all from one popup or side panel. |
| [**Tasks++**](tasks-plus-plus/) | A side panel for tracking work tasks by topic, with each task's PR, branch and base a click away. |

Each extension has its own README with details.

### Tab Groups++

One popup that shows every tab group in the window, where you can:

- drag tabs between groups, and drag whole groups along the tab strip
- give groups any color
- merge same-named groups and close duplicate tabs in one click
- save groups to restore later, and export them as JSON to import in Chrome or Edge

### Tasks++

A side panel, opened from the toolbar icon, for keeping track of tasks:

- **Topics:** keep tasks in separate topics, and switch, create, rename or delete topics from the topic bar.
- **Statuses:** each task is in one of the tabs Pending, In Progress, Complete or Abandoned. Tasks can be moved
  between them with buttons or by dragging, and reordered within a tab.
- **Task details:** each task has a title, PR, branch and base, all editable in place, plus SR, MT and CR
  checkboxes.
- **Copy buttons:** copy the PR link, branch, base, or a ready-made command that merges the base into the branch.
- **Export and Import:** save all topics, tasks and settings to a JSON file, and restore them from one.
- **Options:** turn the extension on or off and switch to compact tables. Changes save automatically.

## Repository layout

```
LICENSE                 GNU GPL v3, for the whole repository
run-tests.sh            Runs the tests of every extension
tab-groups-plus-plus/   Tab Groups++
tasks-plus-plus/        Tasks++
```

Each extension folder is self-contained: its own `manifest.json`, icons, source, `package.json`, Playwright tests,
and a `run-tests.sh`.

## Load an extension locally

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick the extension's folder, e.g. `tasks-plus-plus/`.

After editing files, click the reload icon on the extension's card.

## Tests

The tests use [Playwright](https://playwright.dev). They open each extension's pages in a normal browser page,
with a fake `chrome` API, so no extension needs to be installed. You need Node.js and npm.

Run every extension's tests:

```sh
./run-tests.sh
```

Or one extension's tests, from its folder:

```sh
cd tasks-plus-plus
./run-tests.sh
```

On first run, the scripts install the npm dependencies and Playwright's Chromium. Extra arguments go to
`playwright test`, e.g. a single spec file or `--update-snapshots` to update the screenshot tests.

## Packaging

See each extension's README for how to build the zip to upload to the
[Chrome Web Store](https://chrome.google.com/webstore/devconsole) or
[Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge).

## License

This repository is free software, released under the [GNU General Public License v3.0](LICENSE). You can
redistribute and modify it under the terms of that license.
