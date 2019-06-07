#!/usr/bin/env node
/* eslint-disable */
if (process.version.match(/v(\d+)\./)[1] < 4) {
  console.error(
    "readme-assert: Node v4 or greater is required. `readme-assert` did not run."
  );
} else {
  require("./lib/cli.js");
}
