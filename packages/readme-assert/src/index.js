import * as babel from "@babel/core";
import typescriptTransform from "@babel/plugin-transform-typescript";
import presetEnv from "@babel/preset-env";
import commentPlugin from "babel-plugin-transform-comment-to-assert";
import importPlugin from "babel-plugin-transform-rename-import";
import sourceMapSupport from "source-map-support";
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
  const sourceMaps = !shouldPrintCode;
  const sourceMapsFile = shouldPrintCode
    ? path.join(path.dirname(filePath), "readme.md.js")
    : filePath;

  req.forEach(f => {
    require(require.resolve(f, { paths: [process.cwd()] }));
  });
  const mdDirname = path.dirname(filePath);
  process.chdir(mdDirname);
  const mdText = read(filePath);
  const rootPkg = pkgUp.sync();
  const pkg = JSON.parse(read(rootPkg));
  const code = extract(mdText, { auto });

  const transformed = babel.transform(code, {
    babelrc,
    sourceMaps,
    plugins: [
      typescriptTransform,
      commentPlugin,
      rootPkg
        ? [
            importPlugin,
            { replacement: main || process.cwd(), original: pkg.name }
          ]
        : undefined
    ],
    presets: [presetEnv],
    filename: sourceMapsFile
  });

  if (sourceMaps) {
    sourceMapSupport.install({
      retrieveSourceMap(request) {
        if (request === filePath) {
          return {
            url: sourceMapsFile,
            map: transformed.map
          };
        }
        return null;
      }
    });
  }

  if (shouldPrintCode) {
    printCode(transformed.code, sourceMapsFile);
  }
  require("./global-assert");
  runInThisContext(transformed.code, sourceMapsFile);
}

function read(file) {
  return fs.readFileSync(path.join(file), "utf-8");
}

function printCode(code, sourceMapsFile) {
  console.log("\n# ", sourceMapsFile);
  code
    .split("\n")
    .forEach((l, i) => console.log(`# ${String(i + 1).padEnd(3, " ")} ${l}`));
}
