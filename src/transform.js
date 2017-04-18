import commentPlugin from 'babel-plugin-transform-comment-to-assert';
import importPlugin from 'babel-plugin-transform-rename-import';
import { transform } from 'babel-core';

export default function transformCode(
  code,
  original,
  replacement = process.cwd(),
  babel = {},
  opts = {},
) {
  return transform(code, Object.assign({}, babel, {
    plugins: [
      ...babel.plugins || [],
      [importPlugin, { replacement, original }],
      [commentPlugin],
    ],
  }, opts));
}
