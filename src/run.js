import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractBlocks } from './extract.js';
import { generate } from './generate.js';
import { transform } from './transform.js';
import {
  findPackageJson,
  resolveMainEntry,
  resolveSubpathExport,
} from './resolve.js';

/**
 * @import { TransformResult } from "./transform.js"
 * @import { Unit } from "./generate.js"
 */

/**
 * @typedef {{
 *   auto?: boolean,
 *   all?: boolean,
 *   main?: string,
 *   stream?: boolean,
 *   require?: string[],
 *   import?: string[],
 * }} RunOptions
 */

/**
 * @typedef {{
 *   exitCode: number,
 *   stdout: string,
 *   stderr: string,
 * }} ExecResult
 */

/**
 * @typedef {{
 *   exitCode: number,
 *   stdout: string,
 *   stderr: string,
 *   results: (ExecResult & { name: string })[],
 * }} RunResult
 */

/**
 * @typedef {{
 *   code: string,
 *   name: string,
 *   isESM: boolean,
 * }} ProcessedUnit
 */

/**
 * Process a markdown file into executable code units.
 *
 * @param {string} filePath
 * @param {RunOptions} [options]
 * @returns {Promise<ProcessedUnit[]>}
 */
export async function processMarkdown(filePath, options = {}) {
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const extracted = extractBlocks(markdown, {
    auto: options.auto,
    all: options.all,
  });

  if (extracted.blocks.length === 0) {
    const err = /** @type {Error & { code?: string }} */ (
      new Error(`No test code blocks found in ${filePath}`)
    );
    err.code = 'NO_TEST_BLOCKS';
    throw err;
  }

  const { units } = generate(extracted);

  /** @type {((specifier: string) => string | null) | null} */
  let resolve = null;
  const pkgPath = findPackageJson(path.dirname(filePath));
  if (pkgPath) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.name) {
      const mainEntry = options.main || resolveMainEntry(pkg) || './index.js';
      const packageName = /** @type {string} */ (pkg.name);
      const packageDir = path.dirname(pkgPath);
      const localPath = path.resolve(packageDir, mainEntry);
      const exportsMap = pkg.exports;
      resolve = (specifier) => {
        if (specifier === packageName) return localPath;
        if (specifier.startsWith(packageName + '/')) {
          const sub = specifier.slice(packageName.length + 1);
          if (exportsMap) {
            const resolved = resolveSubpathExport(exportsMap, `./${sub}`);
            if (resolved) return path.resolve(packageDir, resolved);
          }
          return `${packageDir}/${sub}`;
        }
        return null;
      };
    }
  }

  /** @type {ProcessedUnit[]} */
  const results = [];
  for (const unit of units) {
    let code = unit.code;

    const transformed = transform(code, {
      typescript: unit.hasTypescript,
      renameImports: resolve,
      hoistImports: true,
      requireMode: (options.require?.length ?? 0) > 0,
      sourceMapSource: filePath,
    });
    code = transformed.code;

    if (unit.hasTypescript) {
      const esbuild = await import('esbuild');
      const result = await esbuild.transform(code, {
        loader: 'ts',
        sourcemap: false,
      });
      code = result.code;
    }

    if (transformed.map) {
      const mapBase64 = Buffer.from(JSON.stringify(transformed.map)).toString(
        'base64',
      );
      code += `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}\n`;
    }

    results.push({ code, name: unit.name, isESM: transformed.isESM });
  }

  return results;
}

/**
 * Run a markdown file as a test.
 *
 * Each code block (or group) is piped to a child Node process via
 * stdin and executed sequentially. Stops on first failure.
 *
 * When `options.stream` is true, each child's stdout chunk is written
 * to `process.stdout` as it arrives so long-running blocks don't look
 * stalled. Captured stdout is still returned in the result for
 * programmatic callers.
 *
 * @param {string} filePath
 * @param {RunOptions} [options]
 * @returns {Promise<RunResult>}
 */
export async function run(filePath, options = {}) {
  const units = await processMarkdown(filePath, options);
  const dir = path.dirname(filePath);
  let allStdout = '';
  let allStderr = '';
  /** @type {(ExecResult & { name: string })[]} */
  const results = [];

  const stream = options.stream ?? false;

  for (const unit of units) {
    const inputType = unit.isESM ? 'module' : 'commonjs';
    /** @type {string[]} */
    const nodeArgs = [
      '--enable-source-maps',
      `--input-type=${inputType}`,
    ];
    for (const r of options.require || []) nodeArgs.push('--require', r);
    for (const i of options.import || []) nodeArgs.push('--import', i);

    const result = await exec(
      'node',
      nodeArgs,
      unit.code,
      dir,
      filePath,
      stream,
    );
    allStdout += result.stdout;
    allStderr += result.stderr;
    results.push({ name: unit.name, ...result });

    if (result.exitCode !== 0) {
      return {
        exitCode: result.exitCode,
        stdout: allStdout,
        stderr: allStderr,
        results,
      };
    }
  }

  return { exitCode: 0, stdout: allStdout, stderr: allStderr, results };
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} code
 * @param {string} cwd
 * @param {string} mdPath
 * @param {boolean} stream
 * @returns {Promise<ExecResult>}
 */
function exec(cmd, args, code, cwd, mdPath, stream) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(code);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (/** @type {string} */ chunk) => {
      if (stream) process.stdout.write(chunk);
      stdout += chunk;
    });
    child.stderr.on('data', (/** @type {string} */ d) => (stderr += d));

    child.on('close', (/** @type {number | null} */ exitCode) => {
      stderr = stderr.replaceAll('[stdin]', mdPath);
      stdout = stdout.replaceAll('[stdin]', mdPath);

      if (exitCode !== 0) {
        stderr = formatError(stderr, mdPath);
      }

      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

/**
 * @param {string} stderr
 * @param {string} mdPath
 * @returns {string}
 */
function formatError(stderr, mdPath) {
  const locMatch = stderr.match(
    new RegExp(`${escapeRegExp(mdPath)}:(\\d+):(\\d+)`),
  );
  const line = locMatch ? parseInt(locMatch[1]) : null;
  const actualMatch = stderr.match(/actual: (.+)/);
  const expectedMatch = stderr.match(/expected: (.+)/);
  const msgMatch = stderr.match(/AssertionError.*?:\s*(.+)/);
  const genericMatch = !msgMatch && stderr.match(/(\w*Error.*)/);

  /** @type {string[]} */
  const parts = [];
  const relPath = path.relative(process.cwd(), mdPath);
  if (line) {
    parts.push(`\n  FAIL  ${relPath}:${line}\n`);
  } else {
    parts.push(`\n  FAIL  ${relPath}\n`);
  }

  if (line) {
    try {
      const mdLines = fs.readFileSync(mdPath, 'utf-8').split('\n');
      const start = Math.max(0, line - 3);
      const end = Math.min(mdLines.length, line + 2);
      for (let i = start; i < end; i++) {
        const lineNum = String(i + 1).padStart(4);
        const marker = i + 1 === line ? ' > ' : '   ';
        parts.push(`${marker}${lineNum} | ${mdLines[i]}`);
      }
      parts.push('');
    } catch {
      // ignore read errors
    }
  }

  if (actualMatch && expectedMatch) {
    parts.push(`  expected: ${expectedMatch[1].replace(/,\s*$/, '')}`);
    parts.push(`  received: ${actualMatch[1].replace(/,\s*$/, '')}`);
    parts.push('');
  } else if (msgMatch) {
    parts.push(`  ${msgMatch[0]}`);
    parts.push('');
  } else if (genericMatch) {
    parts.push(`  ${genericMatch[1]}`);
    parts.push('');
  } else {
    // Fallback: strip Node internals and return cleaned stderr
    parts.push(
      stderr
        .split('\n')
        .filter(
          (l) =>
            !l.match(
              /^\s*(at [a-z].*\(node:|node:internal|Node\.js v|triggerUncaught|\^$)/i,
            ),
        )
        .join('\n')
        .trim(),
    );
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
