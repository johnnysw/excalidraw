// Compile every maintained Excalidraw stylesheet without suppressing warnings.
// --sass selects the consuming app's compiler; --baseline compares captured CSS.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  assert(args[index + 1], `Missing value for ${name}`);
  return args[index + 1];
}

const sass = require(option("--sass") || "sass");
const root = path.resolve(__dirname, "..");
const stylesRoot = path.join(root, "packages/excalidraw");
const styles = fs
  .readdirSync(stylesRoot, { recursive: true })
  .filter((file) => file.endsWith(".scss"));
const results = {};
const warnings = [];
for (const file of styles) {
  results[file] = sass.compile(path.join(stylesRoot, file), {
    loadPaths: [path.join(root, "node_modules")],
    logger: {
      warn: (message) => warnings.push({ file, message }),
      debug: () => {},
    },
  }).css;
}
assert.deepEqual(warnings, [], "Stylesheets must compile without Sass warnings");

const baselinePath = option("--baseline");
let compared = 0;
if (baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  // The only intended output addition is Open Color's retained MIT notice.
  const withoutLicense = (css) =>
    css.replace(/\/\*!\n \* Open Color 1\.9\.1[\s\S]*?\*\/\n?/, "");
  for (const [file, css] of Object.entries(baseline)) {
    assert.equal(typeof results[file], "string", `Missing stylesheet: ${file}`);
    assert.equal(withoutLicense(results[file]), css, `CSS changed: ${file}`);
    compared++;
  }
}
console.log(
  JSON.stringify({
    compiler: sass.info,
    compiled: styles.length,
    warnings: warnings.length,
    compared,
  }),
);
