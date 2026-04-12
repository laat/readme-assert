import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { extractBlocks } from "./extract.js";
import { generate } from "./generate.js";
import { commentToAssert } from "./comment-to-assert.js";

const tmpFiles = new Set();

function cleanupTmpFiles() {
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
  tmpFiles.clear();
}

process.on("exit", cleanupTmpFiles);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanupTmpFiles();
    process.kill(process.pid, signal);
  });
}

/**
 * Process a markdown file into executable code units.
 *
 * @param {string} filePath
 * @param {{ auto?: boolean, all?: boolean, main?: string }} options
 * @returns {Promise<Array<{ code: string, name: string }>>}
 */
export async function processMarkdown(filePath, options = {}) {
  const markdown = fs.readFileSync(filePath, "utf-8");
  const extracted = extractBlocks(markdown, {
    auto: options.auto,
    all: options.all,
  });

  if (extracted.blocks.length === 0) {
    const err = new Error(`No test code blocks found in ${filePath}`);
    err.code = "NO_TEST_BLOCKS";
    throw err;
  }

  const { units } = generate(extracted);

  // Resolve package info for import renaming
  let packageName, localPath, exportsMap, packageDir;
  const pkgPath = findPackageJson(path.dirname(filePath));
  if (pkgPath) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.name) {
      const mainEntry = options.main || resolveMainEntry(pkg) || "./index.js";
      packageName = pkg.name;
      packageDir = path.dirname(pkgPath);
      localPath = path.resolve(packageDir, mainEntry);
      exportsMap = pkg.exports;
    }
  }

  const results = [];
  for (const unit of units) {
    let code = unit.code;

    if (packageName) {
      code = renameImports(code, packageName, localPath, {
        exportsMap,
        packageDir,
      });
    }

    const transformed = commentToAssert(code, {
      typescript: unit.hasTypescript,
    });
    code = transformed.code;

    if (unit.hasTypescript) {
      const esbuild = await import("esbuild");
      const result = await esbuild.transform(code, {
        loader: "ts",
        sourcemap: false,
      });
      code = result.code;
    }

    results.push({ code, name: unit.name });
  }

  return results;
}

/**
 * Run a markdown file as a test.
 *
 * Each code block (or group) is written to a temp file and executed
 * sequentially. Stops on first failure.
 *
 * When `options.stream` is true, each child's stdout chunk is written
 * to `process.stdout` as it arrives so long-running blocks don't look
 * stalled. Captured stdout is still returned in the result for
 * programmatic callers.
 *
 * @param {string} filePath
 * @param {{ auto?: boolean, all?: boolean, main?: string, stream?: boolean }} options
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, results: Array }>}
 */
export async function run(filePath, options = {}) {
  const units = await processMarkdown(filePath, options);
  const dir = path.dirname(filePath);
  let allStdout = "";
  let allStderr = "";
  const results = [];

  const useRequire = options.require?.length > 0;
  const stream = options.stream ?? false;

  for (const unit of units) {
    let code = unit.code;

    // --require hooks only work with CJS, so downgrade dynamic import to require
    if (useRequire && code.includes("await import(")) {
      code = code.replace(
        'const { default: assert } = await import("node:assert/strict");',
        'const assert = require("node:assert/strict");',
      );
    }

    const isESM = /^import\s/m.test(code) || /^export\s/m.test(code) || code.includes("await import(");
    const ext = isESM ? ".mjs" : ".cjs";
    const tmpFile = path.join(dir, `.readme-assert-${randomUUID().slice(0, 8)}${ext}`);
    tmpFiles.add(tmpFile);
    fs.writeFileSync(tmpFile, code);

    try {
      const nodeArgs = [];
      for (const r of options.require || []) nodeArgs.push("--require", r);
      for (const i of options.import || []) nodeArgs.push("--import", i);
      nodeArgs.push(tmpFile);
      const result = await exec("node", nodeArgs, dir, filePath, stream);
      allStdout += result.stdout;
      allStderr += result.stderr;
      results.push({ name: unit.name, ...result });

      if (result.exitCode !== 0) {
        return { exitCode: result.exitCode, stdout: allStdout, stderr: allStderr, results };
      }
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
      tmpFiles.delete(tmpFile);
    }
  }

  return { exitCode: 0, stdout: allStdout, stderr: allStderr, results };
}

function exec(cmd, args, cwd, mdPath, stream) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      if (stream) process.stdout.write(chunk);
      stdout += chunk;
    });
    child.stderr.on("data", (d) => (stderr += d));

    child.on("close", (exitCode) => {
      // Rewrite temp file paths to the markdown file path
      const tmpFile = args[args.length - 1];
      stderr = stderr.replaceAll(tmpFile, mdPath);
      stdout = stdout.replaceAll(tmpFile, mdPath);

      if (exitCode !== 0) {
        stderr = formatError(stderr, mdPath);
      }

      resolve({ exitCode, stdout, stderr });
    });
  });
}

function formatError(stderr, mdPath) {
  // Extract location from stack trace
  const locMatch = stderr.match(new RegExp(`${escapeRegExp(mdPath)}:(\\d+):(\\d+)`));
  const line = locMatch ? parseInt(locMatch[1]) : null;

  // Extract actual/expected from the error object dump
  const actualMatch = stderr.match(/actual: (.+)/);
  const expectedMatch = stderr.match(/expected: (.+)/);
  const operatorMatch = stderr.match(/operator: '(.+)'/);

  // Extract the error message line
  const msgMatch = stderr.match(/AssertionError.*?:\s*(.+)/);
  // Also catch non-assertion errors (ReferenceError, TypeError, etc.)
  const genericMatch = !msgMatch && stderr.match(/(\w*Error.*)/);

  const parts = [];

  // Location header
  const relPath = path.relative(process.cwd(), mdPath);
  if (line) {
    parts.push(`\n  FAIL  ${relPath}:${line}\n`);
  } else {
    parts.push(`\n  FAIL  ${relPath}\n`);
  }

  // Source context from the markdown
  if (line) {
    try {
      const mdLines = fs.readFileSync(mdPath, "utf-8").split("\n");
      const start = Math.max(0, line - 3);
      const end = Math.min(mdLines.length, line + 2);
      for (let i = start; i < end; i++) {
        const lineNum = String(i + 1).padStart(4);
        const marker = i + 1 === line ? " > " : "   ";
        parts.push(`${marker}${lineNum} | ${mdLines[i]}`);
      }
      parts.push("");
    } catch {
      // ignore read errors
    }
  }

  // Actual vs expected
  if (actualMatch && expectedMatch) {
    parts.push(`  expected: ${expectedMatch[1].replace(/,\s*$/, "")}`);
    parts.push(`  received: ${actualMatch[1].replace(/,\s*$/, "")}`);
    parts.push("");
  } else if (msgMatch) {
    parts.push(`  ${msgMatch[0]}`);
    parts.push("");
  } else if (genericMatch) {
    parts.push(`  ${genericMatch[1]}`);
    parts.push("");
  } else {
    // Fallback: strip Node internals and return cleaned stderr
    parts.push(
      stderr
        .split("\n")
        .filter((l) => !l.match(/^\s*(at [a-z].*\(node:|node:internal|Node\.js v|triggerUncaught|\^$)/i))
        .join("\n")
        .trim(),
    );
    parts.push("");
  }

  return parts.join("\n");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renameImports(
  code,
  packageName,
  localPath,
  { exportsMap, packageDir } = {},
) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function resolveSubpath(sub) {
    if (exportsMap) {
      const resolved = resolveSubpathExport(exportsMap, `./${sub}`);
      if (resolved) return path.resolve(packageDir, resolved);
    }
    return `${packageDir}/${sub}`;
  }

  return code
    .replace(
      new RegExp(`(from\\s+['"])${escaped}(['"])`, "g"),
      `$1${localPath}$2`,
    )
    .replace(
      new RegExp(`(from\\s+['"])${escaped}/([^'"]+)(['"])`, "g"),
      (_, pre, sub, post) => `${pre}${resolveSubpath(sub)}${post}`,
    )
    .replace(
      new RegExp(`(require\\s*\\(\\s*['"])${escaped}(['"]\\s*\\))`, "g"),
      `$1${localPath}$2`,
    )
    .replace(
      new RegExp(
        `(require\\s*\\(\\s*['"])${escaped}/([^'"]+)(['"]\\s*\\))`,
        "g",
      ),
      (_, pre, sub, post) => `${pre}${resolveSubpath(sub)}${post}`,
    );
}

function findPackageJson(dir) {
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

  // If any key starts with ".", this is a subpath map and the root export
  // lives at "."; otherwise the object itself is the conditional map.
  const isSubpathMap = Object.keys(exp).some((k) => k.startsWith("."));
  const root = isSubpathMap ? exp["."] : exp;

  return resolveExportCondition(root);
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

/**
 * Resolve a subpath export from the package.json exports map.
 *
 *   resolveSubpathExport({ ".": "./index.js", "./utils": "./src/utils.js" }, "./utils")
 *   // => "./src/utils.js"
 *
 * Returns null when the exports map doesn't contain the subpath.
 */
export function resolveSubpathExport(exportsMap, subpath) {
  if (!exportsMap || typeof exportsMap === "string") return null;
  if (typeof exportsMap !== "object") return null;

  const isSubpathMap = Object.keys(exportsMap).some((k) => k.startsWith("."));
  if (!isSubpathMap) return null;

  if (subpath in exportsMap) {
    return resolveExportCondition(exportsMap[subpath]);
  }

  return null;
}
