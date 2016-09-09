#!/usr/bin/env node
/* eslint-disable global-require, no-console, import/imports-first */

if (process.version.match(/v(\d+)\./)[1] < 4) {
  console.error('standard: Node v4 or greater is required. `readme-assert` did not run.');
  process.exit();
}

import { docopt } from 'docopt';
import run from '.';
const doc = `
Usage:
  readme-assert [-p] [--main=<file>] [--require=<module>...]

Options:
  -p --print-code                   Print the transformed code
  -m <file>, --main=<file>          Points to the entry point of the module
  -r <module>, --require=<module>   Require a given module
`;
const args = docopt(doc, { version: require('../package.json').version });
const req = args['--require'];
const main = args['--main'] || undefined;
const printCode = args['--print-code'];

run(main, req, printCode);
