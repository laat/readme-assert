import { visitorKeys, parseSync } from 'oxc-parser';

import type { Comment } from 'oxc-parser';

export type Position = { line: number; column: number };
export type SourceLocation = { start: Position; end: Position };
export type AstNode = Record<string, any> & {
  type: string;
  start?: number;
  end?: number;
  loc?: SourceLocation;
};

export const assertCommentRe = /\/\/\s*(=>|→|->|throws|rejects)/;

export function walkAst(node: AstNode, visitor: (node: AstNode) => void): void {
  if (!node || typeof node !== 'object') return;
  if (node.type) {
    visitor(node);
    const keys = visitorKeys[node.type];
    if (keys) {
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) walkAst(item, visitor);
        } else {
          walkAst(child, visitor);
        }
      }
    }
    return;
  }
  // Fallback for untyped containers (e.g. { body: [...] })
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, visitor);
    }
  }
}

export function isDeclaration(node: AstNode): boolean {
  return (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportNamedDeclaration' ||
    node.type === 'ExportDefaultDeclaration' ||
    node.type === 'ExportAllDeclaration'
  );
}

export function getSourceNode(node: AstNode): AstNode | null {
  if (node.type === 'ImportDeclaration') return node.source;
  if (node.type === 'ExportNamedDeclaration' && node.source) return node.source;
  if (node.type === 'ExportAllDeclaration') return node.source;
  return null;
}

export function isRequireCall(node: AstNode): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments?.length >= 1 &&
    (node.arguments[0].type === 'StringLiteral' ||
      node.arguments[0].type === 'Literal') &&
    typeof node.arguments[0].value === 'string'
  );
}

export function findRequireCalls(node: AstNode): AstNode[] {
  const results: AstNode[] = [];
  walkAst(node, (n) => {
    if (isRequireCall(n)) results.push(n);
  });
  return results;
}

export function isConsoleCall(expr: AstNode): boolean {
  return (
    expr.type === 'CallExpression' &&
    expr.callee?.type === 'MemberExpression' &&
    expr.callee.object?.type === 'Identifier' &&
    expr.callee.object.name === 'console'
  );
}

export function findTrailingComment(
  comments: Comment[],
  node: AstNode & { expression: AstNode },
  code: string,
): Comment | null {
  for (const c of comments) {
    if (c.type !== 'Line') continue;
    const exprEnd = node.expression.end as number;
    if (c.start < exprEnd) continue;
    const between = code.slice(exprEnd, c.start);
    if (between.includes('\n')) continue;
    return c;
  }
  return null;
}

// --- Location utilities ---

export function buildLineIndex(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

export function offsetToLoc(lineStarts: number[], offset: number): Position {
  let lo = 0,
    hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] };
}

export function addLoc(ast: AstNode, source: string): void {
  const lineStarts = buildLineIndex(source);
  walkAst(ast, (node) => {
    if ('start' in node && 'end' in node) {
      node.loc = {
        start: offsetToLoc(lineStarts, node.start as number),
        end: offsetToLoc(lineStarts, node.end as number),
      };
    }
  });
}

export function stampLoc(node: AstNode, loc: SourceLocation): void {
  walkAst(node, (n) => {
    n.loc = { start: { ...loc.start }, end: { ...loc.end } };
  });
}

/**
 * Parse a code snippet and return all top-level identifiers it defines
 * (imports, variables, functions, classes).
 */
export function collectDefinedIdentifiers(code: string): string[] {
  const ids: string[] = [];
  let ast;
  try {
    ast = parseSync('test.js', code).program;
  } catch {
    return ids;
  }
  for (const node of ast.body) {
    switch (node.type) {
      case 'ImportDeclaration':
        for (const s of node.specifiers) {
          if (s.local?.name) ids.push(s.local.name);
        }
        break;
      case 'VariableDeclaration':
        for (const d of node.declarations) {
          if (d.id?.type === 'Identifier') ids.push(d.id.name);
        }
        break;
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        if (node.id?.name) ids.push(node.id.name);
        break;
    }
  }
  return ids;
}
