import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import extract from './extract-code.js'
import transform from './transform-code.js'

export default function run (main, req) {
  const pkg = JSON.parse(read(path.join(process.cwd(), 'package.json')))
  const rawMarkdown = read(exists('README.md') || exists('readme.md'))
  const preCode = extract(rawMarkdown).join('\n\n')
  const prefixedCode = prefixCode(preCode, req)
  const code = transform(prefixedCode, pkg, main)
  printCode(code)
  evalCode(code)
}

function prefixCode (code, req) {
  const pre = req.map(r => `require('${r}');`).join('\n')
  return `${pre};\n var assert = require("assert");\n ${code}`
}

function evalCode (code, req) {
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

function exists (name) {
  try {
    const fullPath = path.join(process.cwd(), name)
    fs.statSync(fullPath)
    return fullPath
  } catch (err) {
    return undefined
  }
}

function printCode (code) {
  console.log('# Testcode:')
  code.split('\n').forEach((l, i) => console.log('# ' + i + ' ' + l))
}
