#!/usr/bin/env node
/* eslint-disable */
if (process.version.match(/v(\d+)\./)[1] < 8) {
  console.error(
    "readme-assert: Node 8 or greater is required. `readme-assert` did not run."
  );
} else {
  require("./lib/cli.js");
}
