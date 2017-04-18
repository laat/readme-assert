import fs from 'fs';
import path from 'path';
import extract from './extract';
import transform from './transform';
import executeCode from './executeCode';
import printCode from './utils/printCode';

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

  return pkg.babel;
}

export default function run(main, req, shouldPrintCode) {
  const pkg = JSON.parse(read('package.json'));
  const rawMarkdown = read(exists('README.md') || exists('readme.md'));
  const code = extract(rawMarkdown);
  const transformedCode = transform(code.code, pkg.name, main, babel(pkg),
    { inputSourceMap: code.map, sourceMaps: true },
  );
  if (shouldPrintCode) printCode(transformedCode.code);
  executeCode(transformedCode);
}
