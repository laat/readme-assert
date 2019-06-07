import codeBlocks from "gfm-code-blocks";

function isJs(block) {
  const lang = block.lang.split(" ")[0];
  return lang === "javascript" || lang === "js";
}

function isTest(block) {
  return block.lang
    .split(" ")
    .slice(1)
    .some(tag => tag === "test");
}

export default function extractCode(markdown) {
  return codeBlocks(markdown)
    .filter(isJs)
    .filter(isTest)
    .map(({ code }) => code);
}
