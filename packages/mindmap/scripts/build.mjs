import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
for (const [mode, minify] of [["dev", false], ["prod", true]]) {
  await build({
    entryPoints: ["src/index.ts"],
    outdir: `dist/${mode}`,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify,
    sourcemap: !minify,
  });
}
