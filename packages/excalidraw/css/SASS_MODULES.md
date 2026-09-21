# Sass modules and Open Color

The maintained stylesheets use Sass `@use` and `@forward`. `variables.module.scss`
forwards the palette, and `theme.scss` forwards the shared mixins and variables,
so component styles can keep their existing member names without global imports.
`color.adjust($alpha: -amount)` preserves the previous `transparentize` and
`fade-out` values.

`_open-color.scss` is a Sass module adaptation of **Open Color 1.9.1**:

- Source: <https://github.com/yeun/open-color/tree/v1.9.1>
- Original SCSS SHA-256: `d495c22de67e63752044e00c3ae086776befa3e7ab6879a5c5e9a36b3e32b0ba`
- Original MIT license SHA-256: `62f1f7f590dd772b61fe8e07eff8c52de11d545f3ba079bc25b38a82a6ea4bae`
- All upstream palette values and exported maps remain unchanged. The only
  semantic source adaptation is `map-get` to `sass:map`'s `map.get`.
- The complete upstream MIT license is retained in a `/*! ... */` comment that
  also survives compressed CSS compilation. Keep this notice in distributed CSS.
- Do not edit `node_modules/open-color` or suppress Sass deprecation warnings.
  When updating the palette, regenerate this module from the reviewed version,
  preserve its license, and compare every entry stylesheet's compiled CSS.

Run the finite check from this repository:

```sh
node scripts/checkSassModules.cjs
```

To use the same compiler as a consuming app:

```sh
node scripts/checkSassModules.cjs --sass /absolute/path/to/app/node_modules/sass
```

An optional `--baseline /path/to/baseline.json` compares every original entry's
compiled CSS with a previously captured `{ "relative/style.scss": "CSS" }` map.
The comparison excludes only the newly retained Open Color MIT comment.

Migration evidence (2026-09-20):

- Teaching app compiler Dart Sass 1.100.0: all 83 original entry stylesheets have
  byte-identical CSS after excluding that added license comment. No selector,
  declaration, order, color, or deduplication difference was observed.
- All 84 resulting SCSS files compile with zero warnings using Dart Sass 1.100.0.
  The original 83 files produced 480 warning callbacks (including summaries of
  repeated warnings) in the same compilation harness.
- The Excalidraw repository's Dart Sass 1.51.0 also compiles all 84 files without
  warnings.
- Compressed Sass output retains the complete Open Color MIT notice.
