import commentVisitor from 'babel-plugin-transform-comment-to-assert';
import importVisitor from 'babel-plugin-transform-rename-import';
import traverse from 'babel-traverse';
import generate from 'babel-generator';
import { transform } from 'babel-core';

export default function createTest(code, original, replacement = process.cwd(), babel) {
  const { ast } = transform(code, babel);
  traverse(ast, importVisitor({
    replacement,
    original,
  }).visitor);
  traverse(ast, commentVisitor().visitor);
  const transformedCode = generate(ast, {}, code).code;
  return transformedCode;
}
