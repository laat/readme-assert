import yargs from "yargs";
import run from ".";
import { version } from "../package.json";
import fs from "fs";
import path from "path";

const argv = yargs
  .usage("\nRun readme as test\n\nUsage: $0 [options]")
  .option("auto", {
    alias: "a",
    description: "Auto discover test code block",
    type: "boolean"
  })
  .option("babel", {
    description: "Use babelrc when transpiling",
    default: false,
    type: "boolean"
  })
  .option("file", {
    alias: "f",
    description: "readme.md file to read"
  })
  .option("main", {
    alias: "m",
    description: "Points to the entry point of the module",
    type: "string"
  })
  .option("print-code", {
    alias: "p",
    description: "Print the transformed code",
    type: "boolean"
  })
  .option("require", {
    alias: "r",
    description: "Require a given module",
    type: "array"
  })
  .alias("h", "help")
  .version(version)
  .help().argv;

function resolve(file) {
  try {
    fs.statSync(path.join(process.cwd(), file));
    return path.resolve(file);
  } catch (err) {
    return undefined;
  }
}

const filename = argv.file
  ? path.resolve(argv.file)
  : resolve("README.md") || resolve("readme.md");

if (filename == null) {
  console.log(fs.statSync(path.join(process.cwd(), "README.md")));
  console.error("could not locate readme.md");
  process.exit(1);
}

run(
  argv.main,
  argv.require,
  argv["print-code"],
  argv.babel,
  argv.file
    ? path.resolve(argv.file)
    : resolve("README.md") || resolve("readme.md"),
  argv.auto
);
