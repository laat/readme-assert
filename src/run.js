import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractBlocks } from './extract.js';
import { generate } from './generate.js';
import { transform } from './transform.js';
import { collectDefinedIdentifiers } from './ast.js';
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
 *   hasTypescript: boolean,
 * }} ProcessedUnit
 */

/**
 * Process a markdown file into executable code units.
 *
 * @param {string} filePath
 * @param {RunOptions} [options]
 * @returns {Promise<{ units: ProcessedUnit[], identifiers: Map<string, number> }>}
 */
export async function processMarkdown(filePath, options = {}) {
  const markdown = await fs.readFile(filePath, 'utf-8');
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

  /** @type {Map<string, number>} */
  const identifiers = new Map();
  for (const block of extracted.blocks) {
    for (const id of collectDefinedIdentifiers(block.code)) {
      identifiers.set(id, block.startLine);
    }
  }

  const { units } = generate(extracted);

  /** @type {((specifier: string) => string | null) | null} */
  let resolve = null;
  const pkgPath = findPackageJson(path.dirname(filePath));
  if (pkgPath) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
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

  const relPath =
    path.relative(process.cwd(), filePath) || path.basename(filePath);

  /** @type {ProcessedUnit[]} */
  const results = [];
  for (const unit of units) {
    let code = unit.code;

    const testBlocks = unit.blocks.map((b) => ({
      label: `${relPath}:${b.startLine}`,
      startLine: b.startLine,
      endLine: b.endLine,
    }));

    const transformed = transform(code, {
      typescript: unit.hasTypescript,
      renameImports: resolve,
      hoistImports: true,
      requireMode: (options.require?.length ?? 0) > 0,
      sourceMapSource: filePath,
      testBlocks,
    });
    code = transformed.code;

    if (transformed.map) {
      const mapBase64 = Buffer.from(JSON.stringify(transformed.map)).toString(
        'base64',
      );
      code += `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}\n`;
    }

    results.push({
      code,
      name: unit.name,
      isESM: transformed.isESM,
      hasTypescript: unit.hasTypescript,
    });
  }

  return { units: results, identifiers };
}

/**
 * Run a markdown file as a test.
 *
 * Each code block (or group) is piped to a child Node process via
 * stdin and executed sequentially.
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
  const { units, identifiers } = await processMarkdown(filePath, options);
  const dir = path.dirname(filePath);
  let allStdout = '';
  let allStderr = '';
  /** @type {(ExecResult & { name: string })[]} */
  const results = [];

  const stream = options.stream ?? false;

  for (const unit of units) {
    let inputType = unit.isESM ? 'module' : 'commonjs';
    if (unit.hasTypescript) inputType += '-typescript';
    /** @type {string[]} */
    const nodeArgs = [
      '--enable-source-maps',
      `--input-type=${inputType}`,
      `--test-reporter=${reporterPath}`,
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
    if (result.exitCode !== 0) {
      const output = result.stdout + result.stderr;
      const refMatch = output.match(/ReferenceError: (\w+) is not defined/);
      if (refMatch) {
        const line = identifiers.get(refMatch[1]);
        if (line != null) {
          result.stderr += `\nhint: "${refMatch[1]}" is defined at line ${line} — to share it, give both blocks the same tag, e.g. test:group\n`;
        }
      }
    }
    allStdout += result.stdout;
    allStderr += result.stderr;
    results.push({ name: unit.name, ...result });
  }

  const exitCode = results.find((r) => r.exitCode !== 0)?.exitCode ?? 0;
  return { exitCode, stdout: allStdout, stderr: allStderr, results };
}

const reporterPath = new URL('./reporter.js', import.meta.url).pathname;

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
    child.stdin.on('error', () => {});
    child.stdin.end(code);
    child.on('error', (err) => {
      resolve({ exitCode: 1, stdout: '', stderr: err.message });
    });
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

      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}
