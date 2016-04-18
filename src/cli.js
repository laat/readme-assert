#!/usr/bin/env node
import run from '.';
import { docopt } from 'docopt';
const doc = `
Usage:
  readme-assert [--main=<file>] [--require=<module>...]

Options:
  -m <file>, --main=<file>          Points to the entry point of the module
  -r <module>, --require=<module>   Require a given module
`;
const args = docopt(doc, { version: require('../package.json').version });
const req = args['--require'];
const main = args['--main'] || undefined;

run(main, req);
