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
} from './ast.js';

/**
 * @import { Comment } from "oxc-parser"
 * @import { AstNode, SourceLocation } from "./ast.js"
 */

/**
 * @typedef {{
 *   code: string,
 *   map: any,
 *   isESM: boolean,
 * }} TransformResult
 */

/**
 * @typedef {{
 *   typescript?: boolean,
 *   renameImports?: ((specifier: string) => string | null) | null,
 *   hoistImports?: boolean,
 *   requireMode?: boolean,
 *   sourceMapSource?: string | null,
 *   testBlocks?: Array<{ label: string, startLine: number, endLine: number }> | null,
 * }} TransformOptions
 */

/** @param {unknown} x @returns {AstNode} */
const asNode = (x) => /** @type {AstNode} */ (x);

/**
 * @param {string} code
 * @param {{ typescript?: boolean }} [options]
 * @returns {TransformResult}
 */
export function commentToAssert(code, { typescript = false } = {}) {
  if (!assertCommentRe.test(code)) return { code, map: null, isESM: false };
  return transform(code, { typescript });
}

/**
 * @param {string} code
 * @param {TransformOptions} [options]
 * @returns {TransformResult}
 */
export function transform(
  code,
  {
    typescript = false,
    renameImports = null,
    hoistImports = false,
    requireMode = false,
    sourceMapSource = null,
    testBlocks = null,
  } = {},
) {
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

  const printed = print(/** @type {any} */ (ast), ts(), {
    sourceMapSource: sourceMapSource || undefined,
    sourceMapContent: sourceMapSource ? code : undefined,
  });
  return {
    code: printed.code,
    map: sourceMapSource ? printed.map : null,
    isESM,
  };
}

/**
 * @param {AstNode} ast
 * @param {string} code
 * @param {((specifier: string) => string | null) | null} resolve
 * @param {boolean} requireMode
 * @returns {{ isESM: boolean, preambleEnd: number }}
 */
function doHoist(ast, code, resolve, requireMode) {
  /** @type {AstNode[]} */
  const declarations = [];
  /** @type {AstNode[]} */
  const body = [];

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

  /** @type {string} */
  let assertCode;
  /** @type {boolean} */
  let isESM;
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
  if (firstNode)
    stampLoc(assertNode, /** @type {SourceLocation} */ (firstNode.loc));
  ast.body = [assertNode, ...declarations, ...body];

  return { isESM, preambleEnd: 1 + declarations.length };
}

/**
 * @param {AstNode} node
 * @param {(specifier: string) => string | null} resolve
 */
function renameSpecifiers(node, resolve) {
  const source = getSourceNode(node);
  if (source) renameStringLiteral(source, resolve);
  for (const call of findRequireCalls(node)) {
    renameStringLiteral(call.arguments[0], resolve);
  }
}

/**
 * @param {AstNode} literal
 * @param {(specifier: string) => string | null} resolve
 */
function renameStringLiteral(literal, resolve) {
  const newPath = resolve(literal.value);
  if (newPath != null) {
    literal.value = newPath;
    literal.raw = JSON.stringify(newPath);
  }
}

/**
 * @param {AstNode} ast
 * @param {Comment[]} comments
 * @param {string} code
 */
function applyAssertions(ast, comments, code) {
  for (let i = 0; i < ast.body.length; i++) {
    const node = /** @type {AstNode} */ (ast.body[i]);
    if (node.type !== 'ExpressionStatement') continue;

    const comment = findTrailingComment(
      comments,
      /** @type {AstNode & { expression: AstNode }} */ (node),
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

    /** @type {AstNode[] | undefined} */
    let newNodes;

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
      for (const n of newNodes)
        stampLoc(n, /** @type {SourceLocation} */ (node.loc));
      ast.body.splice(i, 1, ...newNodes);
      i += newNodes.length - 1;
    }
  }
}

/**
 * @param {AstNode} ast
 * @param {Array<{ label: string, startLine: number, endLine: number }>} blocks
 * @param {number} preambleEnd
 * @param {boolean} isESM
 */
function wrapInTest(ast, blocks, preambleEnd, isESM) {
  const preamble = ast.body.slice(0, preambleEnd);
  const body = ast.body.slice(preambleEnd);

  /** @type {Map<number, AstNode[]>} */
  const groups = new Map();
  for (let i = 0; i < blocks.length; i++) groups.set(i, []);

  for (const node of body) {
    const line = node.loc?.start?.line ?? 0;
    let placed = false;
    for (let i = 0; i < blocks.length; i++) {
      if (line >= blocks[i].startLine && line <= blocks[i].endLine) {
        /** @type {AstNode[]} */ (groups.get(i)).push(node);
        placed = true;
        break;
      }
    }
    if (!placed) preamble.push(node);
  }

  const testStmts = [];
  for (let i = 0; i < blocks.length; i++) {
    const stmts = /** @type {AstNode[]} */ (groups.get(i));
    if (stmts.length === 0) continue;
    // Build wrapper with empty body, stamp it, then insert actual body.
    // This avoids stampLoc overwriting the inner nodes' source locations.
    const fn = arrow([], { async: true });
    const t = stmt(call(id('test'), [literal(blocks[i].label), fn]));
    stampLoc(t, /** @type {SourceLocation} */ (stmts[0].loc));
    fn.body.body = stmts;
    testStmts.push(t);
  }

  const testCode = isESM
    ? 'import { test } from "node:test";'
    : 'const { test } = require("node:test");';
  const testImport = asNode(parseSync('t.js', testCode).program.body[0]);
  const firstNode = preamble[0] || testStmts[0];
  if (firstNode?.loc)
    stampLoc(testImport, /** @type {SourceLocation} */ (firstNode.loc));

  ast.body = [testImport, ...preamble, ...testStmts];
}

/**
 * @param {AstNode} node
 * @returns {string}
 */
function equalMethod(node) {
  return node.type === 'ObjectExpression' || node.type === 'ArrayExpression'
    ? 'deepStrictEqual'
    : 'strictEqual';
}

// --- AST node builders ---

/**
 * @param {string} text
 * @returns {AstNode}
 */
function parseExpr(text) {
  const result = parseSync('t.js', `(${text})`, { preserveParens: false });
  if (result.errors.length)
    throw new Error(`Invalid assertion expression: ${text}`);
  const exprStmt = asNode(result.program.body[0]);
  return exprStmt.expression.type === 'ParenthesizedExpression'
    ? exprStmt.expression.expression
    : exprStmt.expression;
}

/**
 * @param {string} name
 * @returns {AstNode}
 */
function id(name) {
  return { type: 'Identifier', name };
}

/**
 * @param {string} value
 * @returns {AstNode}
 */
function literal(value) {
  return { type: 'Literal', value, raw: JSON.stringify(value) };
}

/**
 * @param {AstNode} obj
 * @param {string} prop
 * @returns {AstNode}
 */
function member(obj, prop) {
  return {
    type: 'MemberExpression',
    object: obj,
    property: id(prop),
    computed: false,
    optional: false,
  };
}

/**
 * @param {AstNode} callee
 * @param {AstNode[]} args
 * @returns {AstNode}
 */
function call(callee, args) {
  return { type: 'CallExpression', callee, arguments: args };
}

/**
 * @param {AstNode} expr
 * @returns {AstNode}
 */
function stmt(expr) {
  return { type: 'ExpressionStatement', expression: expr };
}

/**
 * @param {AstNode} arg
 * @returns {AstNode}
 */
function awaitNode(arg) {
  return { type: 'AwaitExpression', argument: arg };
}

/**
 * @param {AstNode | AstNode[]} body
 * @param {{ async?: boolean, expression?: boolean }} [options]
 * @returns {AstNode}
 */
function arrow(body, { async: isAsync = false, expression = false } = {}) {
  return {
    type: 'ArrowFunctionExpression',
    params: [],
    body: expression ? body : { type: 'BlockStatement', body },
    async: isAsync,
    expression,
  };
}

/**
 * @param {string} key
 * @param {AstNode} value
 * @returns {AstNode}
 */
function prop(key, value) {
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

/**
 * @param {AstNode[]} properties
 * @returns {AstNode}
 */
function obj(properties) {
  return { type: 'ObjectExpression', properties };
}

/**
 * @param {string} method
 * @param {AstNode[]} args
 * @returns {AstNode}
 */
function assertCall(method, args) {
  return call(member(id('assert'), method), args);
}

/**
 * @param {string} name
 * @param {string | undefined} message
 * @returns {AstNode}
 */
function errorMatcher(name, message) {
  const props = [prop('name', literal(name))];
  if (message) {
    const reMatch = message.match(/^\/(.+)\/([gimsuy]*)$/);
    props.push(
      prop('message', reMatch ? parseExpr(message) : literal(message)),
    );
  }
  return obj(props);
}

/**
 * @param {AstNode} expr
 * @param {AstNode | null} matcher
 * @param {{ isAwait: boolean, useRejects: boolean }} options
 * @returns {AstNode}
 */
function throwsOrRejects(expr, matcher, { isAwait, useRejects }) {
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
