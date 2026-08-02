import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(currentDir, "../..");
const sources = [
  "excalidraw-app/App.tsx",
  "packages/excalidraw/components/App.tsx",
  "packages/excalidraw/global.d.ts",
  "packages/excalidraw/reactUtils.ts",
  "packages/excalidraw/renderer/renderNewElementScene.ts",
  "packages/excalidraw/scene/Renderer.ts",
  "packages/excalidraw/wysiwyg/textWysiwyg.tsx",
  "packages/element/src/textElement.ts",
  "packages/element/src/textStyleRanges.ts",
].map((file) => `${file}\n${readFileSync(resolve(rootDir, file), "utf8")}`);
const source = sources.join("\n");

const removedSwitches = [
  "EXCALIDRAW_FREEDRAW_PERF_V2",
  "EXCALIDRAW_FREEDRAW_PERF_V3",
  "EXCALIDRAW_THROTTLE_RENDER",
  "EXCALIDRAW_RICH_TEXT_V2",
  "isFreedrawPerfV2Enabled",
  "isFreedrawPerfV3Enabled",
  "isRichTextV2Enabled",
  "renderActiveFreedrawElementV2",
];

for (const removedSwitch of removedSwitches) {
  assert.equal(
    source.includes(removedSwitch),
    false,
    `${removedSwitch} must not return as a runtime or deployment switch`,
  );
}

assert.match(
  source,
  /Number\(version\[0\]\) > 17/,
  "render throttling should be the default on React 18 and newer",
);
assert.match(
  source,
  /getActiveFreedrawStroke\(newElement\)/,
  "active freedraw rendering should consume the optimized stroke buffer by default",
);
assert.match(
  source,
  /return this\.getVisibleCanvasElementsFromSpatialIndex\(/,
  "viewport culling should use the spatial index by default",
);
assert.match(
  source,
  /textStyleRanges/,
  "the default text path should retain text style ranges",
);

console.log("Excalidraw performance defaults contract assertions passed");
