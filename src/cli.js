#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import fs from "node:fs";

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      main: { type: "string", short: "m" },
      auto: { type: "boolean", short: "a", default: false },
      all: { type: "boolean", short: "l", default: false },
      require: { type: "string", short: "r", multiple: true },
      import: { type: "string", short: "i", multiple: true },
      "print-code": { type: "boolean", short: "p", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    strict: true,
    allowPositionals: true,
  }));
} catch (err) {
  console.error(err.message);
  console.error("Run with --help to see supported options.");
  process.exit(1);
}

if (args.help) {
  console.log(`
Run code blocks in your readme as tests

Usage: readme-assert [options]

Options:
  --file, -f        readme.md file to read
  --main, -m        Entry point of the module
  --auto, -a        Auto discover test code blocks
  --all, -l         Run all supported code blocks
  --require, -r     Require a module before running          [array]
  --import, -i      Import a module before running           [array]
  --print-code, -p  Print the transformed code
  --version, -v     Show version number
  -h, --help        Show help
`);
  process.exit(0);
}

if (args.version) {
  const pkgPath = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  console.log(pkg.version);
  process.exit(0);
}

function findReadme() {
  for (const name of ["README.md", "readme.md"]) {
    const p = path.resolve(name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const filePath = args.file ? path.resolve(args.file) : findReadme();

if (!filePath) {
  console.error("Could not locate readme.md");
  process.exit(1);
}

const opts = {
  auto: args.auto,
  all: args.all,
  main: args.main,
  require: args.require,
  import: args.import,
};

try {
  if (args["print-code"]) {
    const { processMarkdown } = await import("./run.js");
    const units = await processMarkdown(filePath, opts);
    for (const unit of units) {
      console.log(`# --- ${unit.name} ---`);
      console.log(unit.code);
    }
  } else {
    const { run } = await import("./run.js");
    const { exitCode, stdout, stderr, results } = await run(filePath, opts);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    if (exitCode === 0) {
      console.log(`All assertions passed. (${results.length} blocks)`);
    }
    process.exitCode = exitCode;
  }
} catch (err) {
  if (err?.code === "NO_TEST_BLOCKS") {
    const relPath = path.relative(process.cwd(), filePath);
    console.error(`No test code blocks found in ${relPath}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
