import commentPlugin from "babel-plugin-transform-comment-to-assert";
import importPlugin from "babel-plugin-transform-rename-import";
import { transform } from "@babel/core";

export default function createTest(
  code,
  original,
  replacement = process.cwd(),
  babel = {},
  message = null
) {
  return transform(
    code,
    Object.assign({}, babel, {
      plugins: [
        ...(babel.plugins || []),
        [importPlugin, { replacement, original }],
        [commentPlugin, { message }]
      ]
    })
  ).code;
}
