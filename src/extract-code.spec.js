/*global describe, it */

import extractCode from './extract-code.js'
import { expect } from 'chai'

function test (pre, post) {
  post = post.map(p => p.trim())
  expect(extractCode(pre)).to.deep.equal(post)
}
describe('code extraction', () => {
  it('should extract a tagged block', () => {
    test(`
# a readme
\`\`\`javascript
console.log('expect me') //=>
\`\`\`
`, [`
console.log('expect me') //=>
`])
  })

  it('should extract all tagged blocks', () => {
    test(`
# a readme
\`\`\`javascript
console.log('expect me') //=>
\`\`\`
\`\`\`javascript
console.log('expect me 2') //=>
\`\`\`
\`\`\`javascript
console.log('expect me 3') //=>
\`\`\`
`, [`
console.log('expect me') //=>
`, `
console.log('expect me 2') //=>
`, `
console.log('expect me 3') //=>
`])
  })

  it('should not extract other blocks', () => {
    test(`
# a readme
\`\`\`javascript
console.log('expect me')
\`\`\`
`, [])
  })
})
