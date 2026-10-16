<p><img src="assets/app-icon.png" width="128" height="128" alt="Auto Layout Cleaner icon"></p>

<h1>Auto Layout Cleaner</h1>

<p>Flatten redundant auto layout frames in Figma before dev handoff or AI-to-code.<br>
One click to flatten. One undo to revert.</p>

<p><strong>Figma Plugin</strong></p>

<p>
  <img src="https://img.shields.io/badge/Figma-f24e1e" alt="Figma">
  <img src="https://img.shields.io/badge/JavaScript-f7df1e" alt="JavaScript">
  <img src="https://img.shields.io/badge/HTML-e34f26" alt="HTML">
</p>

<p><a href="https://www.figma.com/community/plugin/1608984541189092337/auto-layout-cleaner">Install from Figma Community</a></p>

![Auto Layout Cleaner in three states: ready to scan, a list of 433 wrappers found, and 301 wrappers removed](assets/screenshot.png)

Auto Layout Cleaner removes the wrapper frames that pile up in auto layout files, for designers handing a file to developers or an AI-to-code tool.

- Finds frames that add nothing visible and flattens them in one click.
- The design looks the same afterwards, with fewer layers to hand off.
- A single `Cmd+Z` undoes the whole clean.

## How it works

Select the frames to clean (or nothing, to scan the whole page), run the plugin and click **Scan Selection** or **Scan Page**. Click a result to zoom to it on the canvas, untick any you want to keep, then click **Clean**. A wrapper only counts when it has no fills, strokes, effects, padding, clipping or prototype links of its own, and its layout matches its parent's. The full rule set is in [docs/redundancy-rules.md](docs/redundancy-rules.md).

## Limits

Instances are read-only, so the plugin can't reach inside them. Main components are skipped unless you turn on **Also clean main components**, which changes every instance in the file, including ones outside your selection. A frame that changes direction or gap from its parent counts as intentional structure and stays.

## Install

Install it from [Figma Community](https://www.figma.com/community/plugin/1608984541189092337/auto-layout-cleaner), or run it from this repo: in Figma Desktop choose **Plugins > Development > Import plugin from manifest** and select `manifest.json`. The redundancy rules have tests against a fake Figma API: `node --test tests/redundancy.test.js`.

---

[MIT](LICENSE)

Made by [santiagoalonso.com](https://santiagoalonso.com)
