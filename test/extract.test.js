import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBlocks } from '../src/extract.js';

describe('extractBlocks', () => {
  it('extracts tagged test blocks', () => {
    const md = [
      '# Hello',
      '',
      '```javascript test',
      '1 + 1 //=> 2',
      '```',
    ].join('\n');

    const { blocks, hasTypescript } = extractBlocks(md);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].code, '1 + 1 //=> 2\n');
    assert.equal(blocks[0].lang, 'javascript');
    assert.equal(blocks[0].tag, 'test');
    assert.equal(blocks[0].startLine, 4);
    assert.equal(hasTypescript, false);
  });

  it("extracts 'should' tagged blocks", () => {
    const md = [
      '```javascript should equal 1',
      'let a = 1;',
      'a; //=> 1',
      '```',
    ].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].tag, 'should equal 1');
  });

  it('skips untagged blocks in default mode', () => {
    const md = [
      '```javascript',
      'const x = 1;',
      '```',
      '',
      '```javascript test',
      'x; //=> 1',
      '```',
    ].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks.length, 1);
    assert.ok(blocks[0].code.includes('//=> 1'));
  });

  it('auto mode detects assertion comments', () => {
    const md = [
      '```javascript',
      '1 + 1 //=> 2',
      '```',
      '',
      '```javascript',
      'const x = 1;',
      '```',
    ].join('\n');

    const { blocks } = extractBlocks(md, { auto: true });
    assert.equal(blocks.length, 1);
    assert.ok(blocks[0].code.includes('//=> 2'));
  });

  it('auto mode detects utf-8 arrow', () => {
    const md = ['```javascript', '1 + 1 // → 2', '```'].join('\n');

    const { blocks } = extractBlocks(md, { auto: true });
    assert.equal(blocks.length, 1);
  });

  it('auto mode detects ascii arrow', () => {
    const md = ['```javascript', '1 + 1 // -> 2', '```'].join('\n');

    const { blocks } = extractBlocks(md, { auto: true });
    assert.equal(blocks.length, 1);
  });

  it('auto mode detects throws', () => {
    const md = ['```javascript', 'fn() // throws /err/', '```'].join('\n');

    const { blocks } = extractBlocks(md, { auto: true });
    assert.equal(blocks.length, 1);
  });

  it('auto mode detects rejects', () => {
    const md = ['```javascript', 'fn() // rejects /err/', '```'].join('\n');

    const { blocks } = extractBlocks(md, { auto: true });
    assert.equal(blocks.length, 1);
  });

  it('all mode includes every JS/TS block', () => {
    const md = [
      '```javascript',
      'const x = 1;',
      '```',
      '',
      '```python',
      'x = 1',
      '```',
      '',
      '```typescript',
      'const y: number = 2;',
      '```',
    ].join('\n');

    const { blocks, hasTypescript } = extractBlocks(md, { all: true });
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].lang, 'javascript');
    assert.equal(blocks[1].lang, 'typescript');
    assert.equal(hasTypescript, true);
  });

  it('tracks correct startLine across multiple blocks', () => {
    const md = [
      '# Title', // 1
      '', // 2
      'Some text.', // 3
      '', // 4
      '```javascript test', // 5
      'let a = 1;', // 6
      '```', // 7
      '', // 8
      '```javascript test', // 9
      'let b = 2;', // 10
      '```', // 11
    ].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].startLine, 6);
    assert.equal(blocks[1].startLine, 10);
  });

  it('handles ts and js shorthand langs', () => {
    const md = [
      '```ts test',
      'const x: number = 1;',
      '```',
      '',
      '```js test',
      'const y = 2;',
      '```',
    ].join('\n');

    const { blocks, hasTypescript } = extractBlocks(md);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].lang, 'ts');
    assert.equal(blocks[1].lang, 'js');
    assert.equal(hasTypescript, true);
  });

  it('returns empty blocks array when no matches', () => {
    const md = '# Just a title\n\nSome text.';
    const { blocks } = extractBlocks(md);
    assert.equal(blocks.length, 0);
  });

  it('parses group from test:groupname tag', () => {
    const md = [
      '```javascript test:mygroup',
      'let x = 1;',
      '```',
      '',
      '```javascript test:mygroup',
      'x; //=> 1',
      '```',
    ].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].group, 'mygroup');
    assert.equal(blocks[1].group, 'mygroup');
  });

  it('ungrouped blocks have null group', () => {
    const md = ['```javascript test', '1; //=> 1', '```'].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks[0].group, null);
  });

  it('parses group from should:groupname tag', () => {
    const md = ['```javascript should:g1 work', '1; //=> 1', '```'].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks[0].group, 'g1');
  });

  it('parses description from should tag', () => {
    const md = [
      '```javascript should add numbers',
      '1 + 1; //=> 2',
      '```',
    ].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks[0].description, 'add numbers');
  });

  it('parses description from test tag', () => {
    const md = ['```javascript test my description', '1; //=> 1', '```'].join(
      '\n',
    );

    const { blocks } = extractBlocks(md);
    assert.equal(blocks[0].description, 'my description');
  });

  it('parses description from grouped tag', () => {
    const md = [
      '```javascript test:group my description',
      '1; //=> 1',
      '```',
    ].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks[0].group, 'group');
    assert.equal(blocks[0].description, 'my description');
  });

  it('has null description when tag has no extra text', () => {
    const md = ['```javascript test', '1; //=> 1', '```'].join('\n');

    const { blocks } = extractBlocks(md);
    assert.equal(blocks[0].description, null);
  });
});
