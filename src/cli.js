#!/usr/bin/env node
import run from '.'
import { docopt } from 'docopt'
const doc = `
Usage:
  readme-assert [--main=<file>] [--require=<module>...]
`
var args = docopt(doc, { version: require('../package.json').version })
const req = args['--require']
const main = args['--main'] || undefined
run(main, req)
