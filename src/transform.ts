import { parseSync } from 'oxc-parser';
import { print } from 'esrap';
import ts from 'esrap/languages/ts';
import {
  assertCommentRe,
  walkAst,
  isDeclaration,
  getSourceNode,
  isRequireCall,
  findRequireCalls,
  isConsoleCall,
  findTrailingComment,
  addLoc,
  stampLoc,
} from './ast.ts';

import type { Comment } from 'oxc-parser';
import type { AstNode, SourceLocation } from './ast.ts';

type TransformResult = {
  code: string;
  map: any;
  isESM: boolean;
};

type TransformOptions = {
  typescript?: boolean;
  renameImports?: ((specifier: string) => string | null) | null;
  hoistImports?: boolean;
  requireMode?: boolean;
  sourceMapSource?: string | null;
  testBlocks?: Array<{
    label: string;
    startLine: number;
    endLine: number;
  }> | null;
};

const asNode = (x: unknown): AstNode => x as AstNode;

export function commentToAssert(
  code: string,
  { typescript = false }: { typescript?: boolean } = {},
): TransformResult {
  if (!assertCommentRe.test(code)) return { code, map: null, isESM: false };
  return transform(code, { typescript });
}

export function transform(
  code: string,
  {
    typescript = false,
    renameImports = null,
    hoistImports = false,
    requireMode = false,
    sourceMapSource = null,
    testBlocks = null,
  }: TransformOptions = {},
): TransformResult {
  const ext = typescript ? 'test.ts' : 'test.js';
  const result = parseSync(ext, code);
  const ast = result.program;
  const comments = result.comments;

  addLoc(asNode(ast), code);

  let isESM = false;
  let preambleEnd = 0;
  if (hoistImports) {
    const hoisted = doHoist(asNode(ast), code, renameImports, requireMode);
    isESM = hoisted.isESM;
    preambleEnd = hoisted.preambleEnd;
  }

  applyAssertions(asNode(ast), comments, code);

  if (testBlocks?.length) {
    wrapInTest(asNode(ast), testBlocks, preambleEnd, isESM);
  }

  const printed = print(ast, ts(), {
    sourceMapSource: sourceMapSource || undefined,
    sourceMapContent: sourceMapSource ? code : undefined,
  });
  return {
    code: printed.code,
    map: sourceMapSource ? printed.map : null,
    isESM,
  };
}

function doHoist(
  ast: AstNode,
  code: string,
  resolve: ((specifier: string) => string | null) | null,
  requireMode: boolean,
): { isESM: boolean; preambleEnd: number } {
  const declarations: AstNode[] = [];
  const body: AstNode[] = [];

  for (const node of ast.body) {
    if (isDeclaration(node)) {
      if (resolve) renameSpecifiers(node, resolve);
      declarations.push(node);
    } else {
      body.push(node);
    }
  }

  if (resolve) {
    for (const call of findRequireCalls(asNode({ body }))) {
      renameStringLiteral(call.arguments[0], resolve);
    }
  }

  const hasESM = declarations.length > 0;
  let hasAwait = false;
  let hasRequire = false;
  for (const node of body) {
    walkAst(node, (n) => {
      if (n.type === 'AwaitExpression') hasAwait = true;
      if (isRequireCall(n)) hasRequire = true;
    });
    if (hasAwait && hasRequire) break;
  }
  const hasCJS = !hasAwait && !hasESM && hasRequire;

  let assertCode: string;
  let isESM: boolean;
  if (hasESM) {
    assertCode = 'import assert from "node:assert/strict";';
    isESM = true;
  } else if (hasCJS || requireMode) {
    assertCode = 'const assert = require("node:assert/strict");';
    isESM = false;
  } else {
    assertCode =
      'const { default: assert } = await import("node:assert/strict");';
    isESM = true;
  }

  const assertNode = asNode(parseSync('t.js', assertCode).program.body[0]);
  const firstNode = declarations[0] || body[0];
  if (firstNode) stampLoc(assertNode, firstNode.loc as SourceLocation);
  ast.body = [assertNode, ...declarations, ...body];

  return { isESM, preambleEnd: 1 + declarations.length };
}

function renameSpecifiers(
  node: AstNode,
  resolve: (specifier: string) => string | null,
): void {
  const source = getSourceNode(node);
  if (source) renameStringLiteral(source, resolve);
  for (const call of findRequireCalls(node)) {
    renameStringLiteral(call.arguments[0], resolve);
  }
}

function renameStringLiteral(
  literal: AstNode,
  resolve: (specifier: string) => string | null,
): void {
  const newPath = resolve(literal.value);
  if (newPath != null) {
    literal.value = newPath;
    literal.raw = JSON.stringify(newPath);
  }
}

function applyAssertions(
  ast: AstNode,
  comments: Comment[],
  code: string,
): void {
  for (let i = 0; i < ast.body.length; i++) {
    const node = ast.body[i] as AstNode;
    if (node.type !== 'ExpressionStatement') continue;

    const comment = findTrailingComment(
      comments,
      node as AstNode & { expression: AstNode },
      code,
    );
    if (!comment) continue;

    const isAwait = node.expression.type === 'AwaitExpression';
    const expr = node.expression;

    const match = comment.value.match(/^\s*(=>|→|->)\s*([\s\S]*)$/);
    const throwsMatch =
      !match && comment.value.match(/^\s*throws(?:\s+([\s\S]*))?$/);
    const rejectsMatch =
      !match &&
      !throwsMatch &&
      comment.value.match(/^\s*rejects(?:\s+([\s\S]*))?$/);

    let newNodes: AstNode[] | undefined;

    if (match) {
      const rest = match[2].trim();
      if (!rest) continue;
      const resolvesMatch = rest.match(/^resolves\s+(?:to\s+)?([\s\S]*)$/);
      const rejectsErrorMatch = rest.match(
        /^rejects\s+((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/,
      );
      const errorMatch = rest.match(/^((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/);

      if (resolvesMatch) {
        const val = parseExpr(resolvesMatch[1].trim());
        const awaited = isAwait ? expr : awaitNode(expr);
        newNodes = [stmt(assertCall(equalMethod(val), [awaited, val]))];
      } else if (rejectsErrorMatch) {
        const matcher = errorMatcher(
          rejectsErrorMatch[1],
          rejectsErrorMatch[2]?.trim(),
        );
        newNodes = [
          throwsOrRejects(expr, matcher, { isAwait, useRejects: true }),
        ];
      } else if (errorMatch) {
        const matcher = errorMatcher(errorMatch[1], errorMatch[2]?.trim());
        newNodes = [
          throwsOrRejects(expr, matcher, { isAwait, useRejects: false }),
        ];
      } else if (isConsoleCall(expr) && expr.arguments.length > 0) {
        const arg = expr.arguments[0];
        const val = parseExpr(rest);
        newNodes = [node, stmt(assertCall(equalMethod(val), [arg, val]))];
      } else {
        const val = parseExpr(rest);
        newNodes = [stmt(assertCall(equalMethod(val), [expr, val]))];
      }
    } else if (throwsMatch) {
      const rest = throwsMatch[1]?.trim();
      const matcher = rest ? parseExpr(rest) : null;
      newNodes = [
        throwsOrRejects(expr, matcher, { isAwait, useRejects: false }),
      ];
    } else if (rejectsMatch) {
      const rest = rejectsMatch[1]?.trim();
      const matcher = rest ? parseExpr(rest) : null;
      newNodes = [
        throwsOrRejects(expr, matcher, { isAwait, useRejects: true }),
      ];
    }

    if (newNodes) {
      for (const n of newNodes) stampLoc(n, node.loc as SourceLocation);
      ast.body.splice(i, 1, ...newNodes);
      i += newNodes.length - 1;
    }
  }
}

function wrapInTest(
  ast: AstNode,
  blocks: Array<{ label: string; startLine: number; endLine: number }>,
  preambleEnd: number,
  isESM: boolean,
): void {
  const preamble = ast.body.slice(0, preambleEnd);
  const body = ast.body.slice(preambleEnd);

  const groups: Map<number, AstNode[]> = new Map();
  for (let i = 0; i < blocks.length; i++) groups.set(i, []);

  for (const node of body) {
    const line = node.loc?.start?.line ?? 0;
    let placed = false;
    for (let i = 0; i < blocks.length; i++) {
      if (line >= blocks[i].startLine && line <= blocks[i].endLine) {
        (groups.get(i) as AstNode[]).push(node);
        placed = true;
        break;
      }
    }
    if (!placed) preamble.push(node);
  }

  const testStmts = [];
  for (let i = 0; i < blocks.length; i++) {
    const stmts = groups.get(i) as AstNode[];
    if (stmts.length === 0) continue;
    // Build wrapper with empty body, stamp it, then insert actual body.
    // This avoids stampLoc overwriting the inner nodes' source locations.
    const fn = arrow([], { async: true });
    const t = stmt(call(id('test'), [literal(blocks[i].label), fn]));
    stampLoc(t, stmts[0].loc as SourceLocation);
    fn.body.body = stmts;
    testStmts.push(t);
  }

  const testCode = isESM
    ? 'import { test } from "node:test";'
    : 'const { test } = require("node:test");';
  const testImport = asNode(parseSync('t.js', testCode).program.body[0]);
  const firstNode = preamble[0] || testStmts[0];
  if (firstNode?.loc) stampLoc(testImport, firstNode.loc as SourceLocation);

  ast.body = [testImport, ...preamble, ...testStmts];
}

function equalMethod(node: AstNode): string {
  if (node.type === 'Literal') return 'strictEqual';
  if (node.type === 'Identifier' && node.name === 'undefined')
    return 'strictEqual';
  return 'deepStrictEqual';
}

// --- AST node builders ---

function parseExpr(text: string): AstNode {
  const result = parseSync('t.js', `(${text})`, { preserveParens: false });
  if (result.errors.length)
    throw new Error(`Invalid assertion expression: ${text}`);
  const exprStmt = asNode(result.program.body[0]);
  return exprStmt.expression.type === 'ParenthesizedExpression'
    ? exprStmt.expression.expression
    : exprStmt.expression;
}

function id(name: string): AstNode {
  return { type: 'Identifier', name };
}

function literal(value: string): AstNode {
  return { type: 'Literal', value, raw: JSON.stringify(value) };
}

function member(obj: AstNode, prop: string): AstNode {
  return {
    type: 'MemberExpression',
    object: obj,
    property: id(prop),
    computed: false,
    optional: false,
  };
}

function call(callee: AstNode, args: AstNode[]): AstNode {
  return { type: 'CallExpression', callee, arguments: args };
}

function stmt(expr: AstNode): AstNode {
  return { type: 'ExpressionStatement', expression: expr };
}

function awaitNode(arg: AstNode): AstNode {
  return { type: 'AwaitExpression', argument: arg };
}

function arrow(
  body: AstNode | AstNode[],
  {
    async: isAsync = false,
    expression = false,
  }: { async?: boolean; expression?: boolean } = {},
): AstNode {
  return {
    type: 'ArrowFunctionExpression',
    params: [],
    body: expression ? body : { type: 'BlockStatement', body },
    async: isAsync,
    expression,
  };
}

function prop(key: string, value: AstNode): AstNode {
  return {
    type: 'Property',
    key: id(key),
    value,
    kind: 'init',
    computed: false,
    method: false,
    shorthand: false,
  };
}

function obj(properties: AstNode[]): AstNode {
  return { type: 'ObjectExpression', properties };
}

function assertCall(method: string, args: AstNode[]): AstNode {
  return call(member(id('assert'), method), args);
}

function errorMatcher(name: string, message: string | undefined): AstNode {
  const props = [prop('name', literal(name))];
  if (message) {
    const reMatch = message.match(/^\/(.+)\/([gimsuy]*)$/);
    props.push(
      prop('message', reMatch ? parseExpr(message) : literal(message)),
    );
  }
  return obj(props);
}

function throwsOrRejects(
  expr: AstNode,
  matcher: AstNode | null,
  { isAwait, useRejects }: { isAwait: boolean; useRejects: boolean },
): AstNode {
  if (isAwait || useRejects) {
    const fn = isAwait
      ? arrow([stmt(expr)], { async: true })
      : arrow(expr, { expression: true });
    const args = matcher ? [fn, matcher] : [fn];
    return stmt(awaitNode(assertCall('rejects', args)));
  }
  const fn = arrow([stmt(expr)]);
  const args = matcher ? [fn, matcher] : [fn];
  return stmt(assertCall('throws', args));
}
