var remark = require('remark')

export default function extractCode (markdown) {
  let tests = []
  remark = remark.use(blockExtractor, {tests})
  var AST = remark.parse(markdown)
  remark.run(AST)  // transform
  return tests
}
function blockExtractor (rmk, options = {tests: []}) {
  return function (root) {
    walk(root, visitor(options.tests))
  }
}

function walk (tree, visitor) {
  let children = tree.children || []
  children.forEach((node) => {
    visitor(node)
    walk(node, visitor)
  })
}

function visitor (tests) {
  return (node) => {
    if (node.type === 'code') {
      let {lang} = parseLang(node.lang)
      if (lang === 'javascript') {
        // Silly github does not support tags
        /* && tags.indexOf('test') >= 0 */
        if (node.value.indexOf('//=>') >= 0) {
          tests.push(node.value)
        }
      }
    }
  }
}

function parseLang (lang) {
  if (!lang) {
    return {}
  }
  return {
    lang: lang.split(' ')[0],
    tags: lang.split(' ').slice(1).filter(n => !!n)
  }
}
