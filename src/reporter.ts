import type { TestEvent } from 'node:test/reporters';

type TestFail = Extract<TestEvent, { type: 'test:fail' }>['data'];

/**
 * Custom test reporter that outputs pass/fail lines without per-process
 * summaries.  Used by the CLI so that multiple child processes don't each
 * print their own "ℹ tests 1 / ℹ pass 1 / …" block.
 */
export default async function* reporter(source: AsyncIterable<TestEvent>) {
  const failures: TestFail[] = [];
  for await (const event of source) {
    if (event.type === 'test:pass') {
      const d = event.data;
      yield `\u2714 ${d.name} (${d.details.duration_ms}ms)\n`;
    } else if (event.type === 'test:fail') {
      const d = event.data;
      yield `\u2716 ${d.name} (${d.details.duration_ms}ms)\n`;
      failures.push(d);
    }
  }
  if (failures.length > 0) {
    yield `\n\u2716 failing tests:\n\n`;
    for (const d of failures) {
      if (d.file) yield `test at ${d.file}:${d.line}:${d.column}\n`;
      yield `\u2716 ${d.name} (${d.details.duration_ms}ms)\n`;
      const cause = d.details?.error?.cause;
      if (cause && typeof cause === 'object') {
        const err = cause as { stack?: string; message?: string };
        const text = err.stack || err.message || String(cause);
        for (const line of text.split('\n')) {
          yield `  ${line}\n`;
        }
      }
    }
  }
}
