import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/generate.ts';

describe('generate', () => {
  it('produces one unit per ungrouped block', () => {
    const { units } = generate({
      blocks: [
        {
          code: 'a; //=> 1\n',
          lang: 'javascript',
          tag: 'test',
          group: null,
          description: null,
          startLine: 3,
          endLine: 3,
        },
        {
          code: 'b; //=> 2\n',
          lang: 'javascript',
          tag: 'test',
          group: null,
          description: null,
          startLine: 7,
          endLine: 7,
        },
      ],
    });
    assert.equal(units.length, 2);
    assert.ok(units[0].code.includes('a; //=> 1'));
    assert.ok(!units[0].code.includes('b; //=> 2'));
    assert.ok(units[1].code.includes('b; //=> 2'));
  });

  it('merges blocks with the same group', () => {
    const { units } = generate({
      blocks: [
        {
          code: 'let x = 1;\n',
          lang: 'javascript',
          tag: 'test:math',
          group: 'math',
          description: null,
          startLine: 3,
          endLine: 3,
        },
        {
          code: 'x; //=> 1\n',
          lang: 'javascript',
          tag: 'test:math',
          group: 'math',
          description: null,
          startLine: 7,
          endLine: 7,
        },
      ],
    });
    assert.equal(units.length, 1);
    assert.ok(units[0].code.includes('let x = 1;'));
    assert.ok(units[0].code.includes('x; //=> 1'));
    assert.equal(units[0].name, 'math');
  });

  it('keeps grouped and ungrouped blocks separate', () => {
    const { units } = generate({
      blocks: [
        {
          code: 'a; //=> 1\n',
          lang: 'javascript',
          tag: 'test',
          group: null,
          description: null,
          startLine: 3,
          endLine: 3,
        },
        {
          code: 'let x = 1;\n',
          lang: 'javascript',
          tag: 'test:g1',
          group: 'g1',
          description: null,
          startLine: 7,
          endLine: 7,
        },
        {
          code: 'x; //=> 1\n',
          lang: 'javascript',
          tag: 'test:g1',
          group: 'g1',
          description: null,
          startLine: 11,
          endLine: 11,
        },
      ],
    });
    assert.equal(units.length, 2);
    assert.ok(units[0].code.includes('a; //=> 1'));
    assert.ok(units[1].code.includes('let x = 1;'));
    assert.ok(units[1].code.includes('x; //=> 1'));
  });

  it('places code at original line positions', () => {
    const { units } = generate({
      blocks: [
        {
          code: 'a; //=> 1\n',
          lang: 'javascript',
          tag: 'test',
          group: null,
          description: null,
          startLine: 3,
          endLine: 3,
        },
      ],
    });
    const lines = units[0].code.split('\n');
    assert.equal(lines[2], 'a; //=> 1');
    assert.equal(lines[0], '');
  });

  it('preserves import positions in assembled code', () => {
    const { units } = generate({
      blocks: [
        {
          code: 'import { foo } from "bar";\nfoo() //=> 42\n',
          lang: 'javascript',
          tag: 'test',
          group: null,
          description: null,
          startLine: 3,
          endLine: 4,
        },
      ],
    });
    const lines = units[0].code.split('\n');
    const importLine = lines.findIndex((l) => l.includes('from "bar"'));
    const bodyLine = lines.findIndex((l) => l.includes('foo()'));
    assert.ok(importLine < bodyLine);
    // Import stays at its original position (not hoisted — transform does that)
    assert.equal(importLine, 2); // startLine 3 → index 2
  });

  it('returns empty units for no blocks', () => {
    const { units } = generate({ blocks: [] });
    assert.equal(units.length, 0);
  });

  it('tracks typescript per unit', () => {
    const { units } = generate({
      blocks: [
        {
          code: 'a; //=> 1\n',
          lang: 'javascript',
          tag: 'test',
          group: null,
          description: null,
          startLine: 3,
          endLine: 3,
        },
        {
          code: 'const x: number = 1;\n',
          lang: 'typescript',
          tag: 'test',
          group: null,
          description: null,
          startLine: 7,
          endLine: 7,
        },
      ],
    });
    assert.equal(units[0].hasTypescript, false);
    assert.equal(units[1].hasTypescript, true);
  });
});
