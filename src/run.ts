import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractBlocks } from './extract.ts';
import { generate } from './generate.ts';
import { transform } from './transform.ts';
import { collectDefinedIdentifiers } from './ast.ts';
import {
  findPackageJson,
  resolveMainEntry,
  resolveSubpathExport,
} from './resolve.ts';

type RunOptions = {
  auto?: boolean;
  all?: boolean;
  main?: string;
  stream?: boolean;
  require?: string[];
  import?: string[];
};

type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  results: (ExecResult & { name: string })[];
};

type ProcessedUnit = {
  code: string;
  name: string;
  isESM: boolean;
  hasTypescript: boolean;
};

/**
 * Process a markdown file into executable code units.
 */
export async function processMarkdown(
  filePath: string,
  options: RunOptions = {},
): Promise<{ units: ProcessedUnit[]; identifiers: Map<string, number> }> {
  const markdown = await fs.readFile(filePath, 'utf-8');
  const extracted = extractBlocks(markdown, {
    auto: options.auto,
    all: options.all,
  });

  if (extracted.blocks.length === 0) {
    const err = new Error(
      `No test code blocks found in ${filePath}`,
    ) as Error & { code?: string };
    err.code = 'NO_TEST_BLOCKS';
    throw err;
  }

  const identifiers: Map<string, number> = new Map();
  for (const block of extracted.blocks) {
    for (const id of collectDefinedIdentifiers(block.code)) {
      identifiers.set(id, block.startLine);
    }
  }

  const { units } = generate(extracted);

  let resolve: ((specifier: string) => string | null) | null = null;
  const pkgPath = findPackageJson(path.dirname(filePath));
  if (pkgPath) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    if (pkg.name) {
      const mainEntry = options.main || resolveMainEntry(pkg) || './index.js';
      const packageName = pkg.name as string;
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

  const results: ProcessedUnit[] = [];
  for (const unit of units) {
    let code = unit.code;

    const testBlocks = unit.blocks.map((b) => ({
      label: b.description
        ? `${relPath}:${b.startLine} — ${b.description}`
        : `${relPath}:${b.startLine}`,
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
 */
export async function run(
  filePath: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const { units, identifiers } = await processMarkdown(filePath, options);
  const dir = path.dirname(filePath);
  let allStdout = '';
  let allStderr = '';
  const results: (ExecResult & { name: string })[] = [];

  const stream = options.stream ?? false;

  for (const unit of units) {
    let inputType = unit.isESM ? 'module' : 'commonjs';
    if (unit.hasTypescript) inputType += '-typescript';
    const nodeArgs: string[] = [
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

const reporterPath = new URL(
  import.meta.url.endsWith('.ts') ? './reporter.ts' : './reporter.js',
  import.meta.url,
).pathname;

function exec(
  cmd: string,
  args: string[],
  code: string,
  cwd: string,
  mdPath: string,
  stream: boolean,
): Promise<ExecResult> {
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

    child.stdout.on('data', (chunk: string) => {
      if (stream) process.stdout.write(chunk);
      stdout += chunk;
    });
    child.stderr.on('data', (d: string) => (stderr += d));

    child.on('close', (exitCode: number | null) => {
      stderr = stderr.replaceAll('[stdin]', mdPath);
      stdout = stdout.replaceAll('[stdin]', mdPath);

      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}
