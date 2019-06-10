import "./global-assert";
import * as babel from "@babel/core";
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
  const code = extract(mdText, filePath, { auto });

  const transformed = babel.transform(code, {
    babelrc,
    sourceMaps: true,
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
    filename: filePath
  });
  require("source-map-support").install({
    // eslint-disable-line
    retrieveSourceMap(request) {
      if (request === filePath) {
        return {
          url: filePath,
          map: transformed.map
        };
      }
      return null;
    }
  });

  if (shouldPrintCode) printCode(transformed.code);
  runInThisContext(transformed.code, filePath);
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
