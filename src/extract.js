import codeBlocks from 'gfm-code-blocks';

const arrowRegex = /\/(\/|\*)\s?(=>|→|throws)/;

export default function extractCode(markdown) {
  return codeBlocks(markdown)
    .filter(({ lang }) => lang === 'javascript' || lang === 'js')
    .filter(({ code }) => code.match(arrowRegex))
    .map(({ code }) => code);
}
