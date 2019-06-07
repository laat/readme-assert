import assert from "assert-simple-tap";
import extractCode from "./extract";

function test(message, pre, post) {
  const trim = post.map(p => p.trim());
  const code = extractCode(pre).map(p => p.trim());
  assert.deepEqual(code, trim, message);
}

test(
  "should extract a tagged block",
  `
# a readme
\`\`\`javascript
console.log('expect me') //=>
\`\`\`
`,
  [
    `
console.log('expect me') //=>
`
  ]
);

test(
  "should extract all tagged blocks",
  `
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
`,
  [
    `
console.log('expect me') //=>
`,
    `
console.log('expect me 2') //=>
`,
    `
console.log('expect me 3') //=>
`
  ]
);

test(
  "should not extract other blocks",
  `
# a readme
\`\`\`javascript
console.log('expect me')
\`\`\`
`,
  []
);

test(
  "should extract a tagged block",
  `
# a readme
\`\`\`javascript
console.log('expect me')
/*=>
*/
\`\`\`
`,
  [
    `
console.log('expect me')
/*=>
*/
`
  ]
);

test(
  "should extract a space tagged block",
  `
# a readme
\`\`\`javascript
console.log('expect me')
/* =>
*/
\`\`\`
`,
  [
    `
console.log('expect me')
/* =>
*/
`
  ]
);

test(
  "should extract a space utf-8 tagged block",
  `
# a readme
\`\`\`javascript
console.log('expect me')
/* →
*/
\`\`\`
`,
  [
    `
console.log('expect me')
/* →
*/
`
  ]
);
