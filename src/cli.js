import yargs from "yargs";
import run from ".";
import { version } from "../package.json";

const argv = yargs
  .option("babel", {
    alias: "b",
    description: "Use babelrc when transpiling",
    type: "boolean"
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

run(argv.main || process.cwd(), argv.require, argv["print-code"], argv.babel);
