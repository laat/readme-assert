#!/usr/bin/env node
/* eslint-disable global-require */
import run from '.';
import { docopt } from 'docopt';
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
