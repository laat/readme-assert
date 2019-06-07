import codeBlocks from "gfm-code-blocks";

function isJs(block) {
  const lang = block.lang.split(" ")[0];
  return lang === "javascript" || lang === "js";
}

function isTest(block) {
  return block.lang
    .split(" ")
    .slice(1)
    .some(tag => tag === "test" || tag === "should");
}

function withMessage(block) {
  const tags = block.lang.split(" ").slice(1);
  let parts;
  if (tags[0] === "test") {
    parts = tags.slice(1);
  } else {
    parts = tags;
  }
  const message = parts.length > 0 ? parts.join(" ") : null;
  return { ...block, message };
}

export default function extractCode(markdown) {
  return codeBlocks(markdown)
    .filter(isJs)
    .filter(isTest)
    .map(withMessage);
}
