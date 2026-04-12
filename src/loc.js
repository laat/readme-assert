export function buildLineIndex(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

export function offsetToLoc(lineStarts, offset) {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] };
}

export function addLoc(ast, source) {
  const lineStarts = buildLineIndex(source);
  walkAst(ast, (node) => {
    if ("start" in node && "end" in node) {
      node.loc = {
        start: offsetToLoc(lineStarts, node.start),
        end: offsetToLoc(lineStarts, node.end),
      };
    }
  });
}

export function stampLoc(node, loc) {
  walkAst(node, (n) => { n.loc = loc; });
}

export function walkAst(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && item.type) walkAst(item, visitor);
      }
    } else if (val && typeof val === "object" && val.type) {
      walkAst(val, visitor);
    }
  }
}
