/* global describe, it */
import createTest from './transform-code.js'
import { expect } from 'chai'

function test (pre, post, pkg) {
  expect(createTest(pre, pkg).trim()).to.equal(post.trim())
}

describe('code tranformation', () => {
  it('should require correct package', () => {
    let pkg = {
      name: 'foobar'
    }

    test(`
var foobar = require('foobar');
`, `
var foobar = require('${process.cwd()}');
`, pkg)
  })
  it('should transform comments', () => {
    let pkg = {
      name: 'foobar'
    }

    test(`
foobar //=> true
`, `
assert.deepEqual(foobar, true);
`, pkg)
  })
})
