import leftPad from './leftPad';

export default function printSource(source) {
  /* eslint-disable no-console */
  console.log('# readme.md.js:');
  source.split('\n').forEach((l, i) => console.log(`# ${leftPad(i + 1, 3)} ${l}`));
  /* eslint-enable no-console */
}
