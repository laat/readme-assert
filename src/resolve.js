import fs from "node:fs";
import path from "node:path";

export function findPackageJson(dir) {
  let current = path.resolve(dir);
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve a package's main entry point from its package.json.
 *
 * Handles `main`, plus the various shapes of `exports`:
 *   - string:          "exports": "./lib/main.js"
 *   - subpath map:     "exports": { ".": "./lib/main.js" }
 *   - conditional:     "exports": { "import": "./esm.js", "require": "./cjs.js" }
 *   - nested:          "exports": { ".": { "import": "./esm.js" } }
 *
 * Returns null if no entry can be determined.
 */
export function resolveMainEntry(pkg) {
  if (pkg.main) return pkg.main;

  const exp = pkg.exports;
  if (!exp) return null;
  if (typeof exp === "string") return exp;
  if (typeof exp !== "object") return null;

  const root = isSubpathExportsMap(exp) ? exp["."] : exp;

  return resolveExportCondition(root);
}

/**
 * Resolve a subpath export from the package.json exports map.
 *
 *   resolveSubpathExport({ ".": "./index.js", "./utils": "./src/utils.js" }, "./utils")
 *   // => "./src/utils.js"
 *
 * Returns null when the exports map doesn't contain the subpath.
 */
export function resolveSubpathExport(exportsMap, subpath) {
  if (!exportsMap || typeof exportsMap !== "object") return null;
  if (!isSubpathExportsMap(exportsMap)) return null;
  if (subpath in exportsMap) {
    return resolveExportCondition(exportsMap[subpath]);
  }
  return null;
}

function resolveExportCondition(node) {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return null;

  // Prefer import > default > require
  for (const key of ["import", "default", "require"]) {
    if (key in node) {
      const resolved = resolveExportCondition(node[key]);
      if (resolved) return resolved;
    }
  }
  return null;
}

function isSubpathExportsMap(exp) {
  return Object.keys(exp).some((k) => k.startsWith("."));
}
