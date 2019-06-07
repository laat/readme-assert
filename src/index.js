import * as babel from "@babel/core";
import typescriptSyntaxPlugin from "@babel/plugin-syntax-typescript";
import typescriptTransform from "@babel/plugin-transform-typescript";
import presetEnv from "@babel/preset-env";
import commentPlugin from "babel-plugin-transform-comment-to-assert";
import importPlugin from "babel-plugin-transform-rename-import";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import extract from "./extract";

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

export default function run(main, req, shouldPrintCode) {
  const pkg = JSON.parse(read("package.json"));
  const readmePath = exists("README.md") || exists("readme.md");
  const rawMarkdown = read(readmePath);
  const codeWithAsserts = extract(rawMarkdown)
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
    babelrc: false,
    plugins: [
      typescriptTransform,
      [importPlugin, { replacement: main || process.cwd(), original: pkg.name }]
    ],
    presets: [presetEnv],
    filename: readmePath
  }).code;

  const prefixedCode = prefixCode(transformed);
  if (shouldPrintCode) printCode(prefixedCode);
  evalCode(prefixedCode, req);
}
