import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const inventory = JSON.parse(
  readFileSync(join(root, "test-groups.json"), "utf8"),
);

const validDispositions = new Set([
  "PR_CRITICAL",
  "FULL_REGRESSION",
  "LOWER_LEVEL",
]);

const actualSpecs = readdirSync(join(root, "tests"))
  .filter((name) => name.endsWith(".spec.ts"))
  .sort();
const inventoriedSpecs = Object.keys(inventory.specs).sort();

const missing = actualSpecs.filter((name) => !inventory.specs[name]);
const stale = inventoriedSpecs.filter((name) => !actualSpecs.includes(name));
const invalid = inventoriedSpecs.filter(
  (name) => !validDispositions.has(inventory.specs[name].disposition),
);

if (missing.length || stale.length || invalid.length) {
  if (missing.length) {
    console.error("Unclassified browser specs:", missing.join(", "));
  }
  if (stale.length) {
    console.error("Inventory entries without a spec file:", stale.join(", "));
  }
  if (invalid.length) {
    console.error("Invalid browser-test dispositions:", invalid.join(", "));
  }
  process.exit(1);
}

const declaredFullCount = inventoriedSpecs.reduce(
  (sum, name) => sum + (inventory.specs[name].baselineTests ?? 0),
  0,
);
const prSpecs = inventoriedSpecs.filter(
  (name) => inventory.specs[name].disposition === "PR_CRITICAL",
);
const declaredPrCount = prSpecs.reduce(
  (sum, name) => sum + (inventory.specs[name].baselineTests ?? 0),
  0,
);

const mode = process.argv[2] ?? "check";
if (mode === "check") {
  console.log(
    `Browser test inventory: ${actualSpecs.length} specs, baseline ${declaredFullCount} tests; PR-critical baseline ${declaredPrCount} tests.`,
  );
  process.exit(0);
}

if (mode !== "pr" && mode !== "full") {
  console.error("Usage: node scripts/test-group.mjs <check|pr|full> [playwright args...]");
  process.exit(2);
}

const selected = mode === "pr" ? prSpecs : inventoriedSpecs;
const forwarded = process.argv.slice(3);
const executable = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);

console.log(
  `Running browser group "${mode}": ${selected.length} spec files (baseline ${mode === "pr" ? declaredPrCount : declaredFullCount} tests).`,
);

const result = spawnSync(
  executable,
  ["test", ...selected.map((name) => `tests/${name}`), ...forwarded],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
