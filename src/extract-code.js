import codeBlocks from 'gfm-code-blocks'

export default function extractCode (markdown) {
  return codeBlocks(markdown)
    .filter(({ lang }) => lang === 'javascript' || lang === 'js')
    .filter(({ code }) => code.indexOf('//=>') >= 0 || code.indexOf('/*=>') >= 0)
    .map(({code}) => code)
}
