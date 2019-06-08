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

function isTest(block) {
  const tag = block.lang.split(" ")[1];
  return tag === "test" || tag === "should";
}

const arrowRegex = /\/(\/|\*)\s?(=>|→|throws)/;
function isAutomaticTest(block) {
  return block.code.match(arrowRegex);
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

export default function extractCode(markdown, { auto = false } = {}) {
  return codeBlocks(markdown)
    .filter(auto ? isAutomaticTest : isTest)
    .filter(isSupportedLang)
    .map(withMessage);
}
