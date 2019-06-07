import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import findUp from "find-up";
import extract from "./extract";
import transform from "./transform";

function prefixCode(code, req) {
  const assertPath = require.resolve("assert-simple-tap");
  const pre = req.map(r => `require('${r}');`).join("\n");
  return `${pre};\nvar assert = require('${assertPath}');\n${code}`;
}

function evalCode(code) {
  const { status } = spawnSync("node", ["-e", code], { stdio: "inherit" });
  process.exit(status);
}

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf-8");
}

function exists(file) {
  try {
    fs.statSync(path.join(process.cwd(), file));
    return file;
  } catch (err) {
    return undefined;
  }
}

function printCode(code) {
  /* eslint-disable no-console */
  console.log("# Testcode:");
  code.split("\n").forEach((l, i) => console.log(`# ${i + 1} ${l}`));
  /* eslint-enable no-console */
}

function babel(pkg) {
  const babelrc = findUp.sync(".babelrc", { cwd: process.cwd() });
  if (babelrc) return JSON.parse(fs.readFileSync(babelrc, "utf8"));

  return pkg.babel;
}

export default function run(main, req, shouldPrintCode) {
  const pkg = JSON.parse(read("package.json"));
  const rawMarkdown = read(exists("README.md") || exists("readme.md"));
  const preCode = extract(rawMarkdown);
  const postCode = preCode
    .map(block =>
      transform(block.code, pkg.name, main, babel(pkg), block.message)
    )
    .join("\n\n");
  const prefixedCode = prefixCode(postCode, req);
  if (shouldPrintCode) printCode(prefixedCode);
  evalCode(prefixedCode);
}
