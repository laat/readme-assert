import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { extractBlocks } from "./extract.js";
import { generate } from "./generate.js";
import { commentToAssert } from "./comment-to-assert.js";

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
    throw new Error("README has no test code blocks");
  }

  const { units } = generate(extracted);

  // Resolve package info for import renaming
  let packageName, localPath;
  const pkgPath = findPackageJson(path.dirname(filePath));
  if (pkgPath) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.name) {
      const mainEntry = options.main || pkg.main || pkg.exports?.["."] || "./index.js";
      packageName = pkg.name;
      localPath = path.resolve(path.dirname(pkgPath), mainEntry);
    }
  }

  const results = [];
  for (const unit of units) {
    let code = unit.code;

    if (packageName) {
      code = renameImports(code, packageName, localPath);
    }

    const transformed = commentToAssert(code, {
      filename: filePath,
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
 * @param {string} filePath
 * @param {{ auto?: boolean, all?: boolean, main?: string }} options
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, results: Array }>}
 */
export async function run(filePath, options = {}) {
  const units = await processMarkdown(filePath, options);
  const dir = path.dirname(filePath);
  let allStdout = "";
  let allStderr = "";
  const results = [];

  const useRequire = options.require?.length > 0;

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

    fs.writeFileSync(tmpFile, code);

    try {
      const nodeArgs = [];
      for (const r of options.require || []) nodeArgs.push("--require", r);
      for (const i of options.import || []) nodeArgs.push("--import", i);
      nodeArgs.push(tmpFile);
      const result = await exec("node", nodeArgs, dir, filePath);
      allStdout += result.stdout;
      allStderr += result.stderr;
      results.push({ name: unit.name, ...result });

      if (result.exitCode !== 0) {
        return { exitCode: result.exitCode, stdout: allStdout, stderr: allStderr, results };
      }
    } finally {
      fs.unlinkSync(tmpFile);
    }
  }

  return { exitCode: 0, stdout: allStdout, stderr: allStderr, results };
}

function exec(cmd, args, cwd, mdPath) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d));
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

function renameImports(code, packageName, localPath) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return code
    .replace(
      new RegExp(`(from\\s+['"])${escaped}(['"])`, "g"),
      `$1${localPath}$2`,
    )
    .replace(
      new RegExp(`(from\\s+['"])${escaped}/`, "g"),
      `$1${path.dirname(localPath)}/`,
    )
    .replace(
      new RegExp(`(require\\s*\\(\\s*['"])${escaped}(['"]\\s*\\))`, "g"),
      `$1${localPath}$2`,
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
