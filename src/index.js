import * as babel from "@babel/core";
import typescriptSyntaxPlugin from "@babel/plugin-syntax-typescript";
import typescriptTransform from "@babel/plugin-transform-typescript";
import presetEnv from "@babel/preset-env";
import commentPlugin from "babel-plugin-transform-comment-to-assert";
import importPlugin from "babel-plugin-transform-rename-import";
import fs from "fs";
import path from "path";
import pkgUp from "pkg-up";
import extract from "./extract";
import { runInThisContext } from "./runInThisContext";

export default function run(
  main,
  req,
  shouldPrintCode,
  babelrc,
  filePath,
  auto
) {
  req.forEach(f => {
    require(require.resolve(f, { paths: [process.cwd()] }));
  });
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
          filename: filePath,
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
  runInThisContext(prefixedCode, filePath);
}

function prefixCode(code) {
  const assertPath = require.resolve("assert-simple-tap");
  return `var assert = require('${assertPath}');\n${code}`;
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
