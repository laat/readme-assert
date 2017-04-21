import fs from 'fs';
import path from 'path';

import commentPlugin from 'babel-plugin-transform-comment-to-assert';
import importPlugin from 'babel-plugin-transform-rename-import';

import parseMarkdown from './utils/parseMarkdown';
import printCode from './utils/printCode';
import executeCode from './utils/executeCode';
import finalizeSource from './utils/finalizeSource';

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
}

function exists(file) {
  try {
    fs.statSync(path.join(process.cwd(), file));
    return file;
  } catch (err) {
    return undefined;
  }
}

function babel(pkg) {
  const babelrc = exists('.babelrc');
  if (babelrc) return JSON.parse(read(babelrc));

  return pkg.babel || {};
}

function babelOpts(main) {
  const pkg = JSON.parse(read('package.json'));
  const pkgBabel = babel(pkg);
  return Object.assign({}, pkgBabel, {
    plugins: [
      ...pkgBabel.plugins || [],
      [commentPlugin],
      [importPlugin, { original: pkg.name, replacement: main }],
    ],
  });
}

export default function run(main, req, shouldPrintCode) {
  const rawMarkdown = read(exists('README.md') || exists('readme.md'));

  const generatedFileName = 'readme.md.js';
  const source = finalizeSource(
    parseMarkdown(rawMarkdown, 'readme.md', babelOpts(main)),
    generatedFileName,
  );

  if (shouldPrintCode) printCode(source.code);

  /* eslint-disable global-require, import/no-dynamic-require*/
  req.forEach(r => require(r));
  executeCode(source, generatedFileName, { assert: require('assert-simple-tap') });
  /* eslint-enable global-require, import/no-dynamic-require */
}
