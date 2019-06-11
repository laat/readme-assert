import codeBlocks from "gfm-code-blocks";

function isSupportedLang(block) {
  const lang = block.lang.split(" ")[0];
  return (
    lang === "javascript" ||
    lang === "js" ||
    lang === "typescript" ||
    lang === "ts"
  );
}

function isTypescript(block) {
  const lang = block.lang.split(" ")[0];
  return lang === "typescript" || lang === "ts";
}

function isTest(block) {
  const tag = block.lang.split(" ")[1];
  return tag === "test" || tag === "should";
}

const arrowRegex = /\/(\/|\*)\s?(=>|→|throws)/;
function isAutomaticTest(block) {
  return block.code.match(arrowRegex);
}

export default function extractCode(markdown, { auto = false } = {}) {
  let hasTypescript = false;
  const code = new Array(markdown.length).fill(" ");
  const newline = /\n/gm;
  let result;
  while ((result = newline.exec(markdown))) {
    code[result.index] = "\n";
  }
  codeBlocks(markdown)
    .filter(auto ? isAutomaticTest : isTest)
    .filter(isSupportedLang)
    .forEach(block => {
      hasTypescript = hasTypescript || isTypescript(block);
      code.splice(block.start, block.end, block.code);
    });
  return {
    code: code.join(""),
    hasTypescript
  };
}
