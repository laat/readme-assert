import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import extract from './extract-code.js'
import transform from './transform-code.js'

export default function run (main, req) {
  const pkg = JSON.parse(read(path.join(process.cwd(), 'package.json')))
  const rawMarkdown = read(path.join(process.cwd(), 'README.md'))
  const preCode = extract(rawMarkdown).join('\n\n')
  const code = transform(preCode, pkg, main)
  evalCode(code, req)
}

function evalCode (code, req) {
  const pre = req.map(r => `require('${r}');`).join('\n')
  code = `
${pre}
var assert = require("assert");
${code}`

  printCode(code)

  process.exit(spawnSync('node', ['-e', code], {
    stdio: 'inherit'
  }).status)
}

function read (file) {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

function printCode (code) {
  console.log('# Testcode:')
  code.split('\n').forEach((l, i) => console.log('# ' + i + ' ' + l))
}

export function foobar () {
  return 'foobar'
}
