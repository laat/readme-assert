import * as babel from "@babel/core";
import typescriptSyntaxPlugin from "@babel/plugin-syntax-typescript";
import typescriptTransform from "@babel/plugin-transform-typescript";
import presetEnv from "@babel/preset-env";
import commentPlugin from "babel-plugin-transform-comment-to-assert";
import importPlugin from "babel-plugin-transform-rename-import";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import pkgUp from "pkg-up";
import extract from "./extract";

export default function run(
  main,
  req,
  shouldPrintCode,
  babelrc,
  filePath,
  auto
) {
  const mdDirname = path.dirname(filePath);
  process.chdir(mdDirname);
  const mdText = read(filePath);
  const rootPkg = pkgUp.sync();
  const pkg = JSON.parse(read(rootPkg));
  const codeWithAsserts = extract(mdText, { auto })
    .map(
      block =>
        babel.transform(block.code, {
          babelrc: false,
          plugins: [
            typescriptSyntaxPlugin,
            [commentPlugin, { message: block.message }]
          ]
        }).code
    )
    .join("\n\n");

  const transformed = babel.transform(codeWithAsserts, {
    babelrc,
    plugins: [
      typescriptTransform,
      rootPkg
        ? [
            importPlugin,
            { replacement: main || process.cwd(), original: pkg.name }
          ]
        : undefined
    ],
    presets: [presetEnv],
    filename: filePath
  }).code;

  const prefixedCode = prefixCode(transformed);
  if (shouldPrintCode) printCode(prefixedCode);
  evalCode(prefixedCode, req);
}

function prefixCode(code) {
  const assertPath = require.resolve("assert-simple-tap");
  return `var assert = require('${assertPath}');\n${code}`;
}

function evalCode(code, req = []) {
  const args = ["-e", code, ...req.reduce((x, y) => x.concat("-r", y), [])];
  const { status } = spawnSync("node", args, { stdio: "inherit" });
  process.exit(status);
}

function read(file) {
  return fs.readFileSync(path.join(file), "utf-8");
}

function printCode(code) {
  console.log("\n# Testcode:");
  code
    .split("\n")
    .forEach((l, i) => console.log(`# ${String(i + 1).padEnd(3, " ")} ${l}`));
}
