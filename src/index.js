import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import extract from './extract-code.js'
import transform from './transform-code.js'

export default function run (main, req) {
  const pkg = JSON.parse(read('package.json'))
  const rawMarkdown = read(exists('README.md') || exists('readme.md'))
  const preCode = extract(rawMarkdown).join('\n\n')
  const transformedCode = transform(preCode, pkg.name, main, babel(pkg))
  const prefixedCode = prefixCode(transformedCode, req)
  printCode(prefixedCode)
  evalCode(prefixedCode)
}

function babel (pkg) {
  const babelrc = exists('.babelrc')
  if (babelrc) return JSON.parse(read(babelrc))

  return pkg.babel
}

function prefixCode (code, req) {
  const assertPath = require.resolve('assert-simple-tap')
  const pre = req.map((r) => `require('${r}');`).join('\n')
  return `${pre};\nvar assert = require('${assertPath}');\n${code}`
}

function evalCode (code, req) {
  const { status } = spawnSync('node', ['-e', code], { stdio: 'inherit' })
  process.exit(status)
}

function read (file) {
  try {
    return fs.readFileSync(path.join(process.cwd(), file), 'utf-8')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

function exists (file) {
  try {
    fs.statSync(path.join(process.cwd(), file))
    return file
  } catch (err) {
    return undefined
  }
}

function printCode (code) {
  console.log('# Testcode:')
  code.split('\n').forEach((l, i) => console.log('# ' + i + ' ' + l))
}
