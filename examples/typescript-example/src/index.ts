export default function leftPad(n: number, width: number): string {
  let sn = n + ''; // hello
  return sn.length >= width ? sn : new Array(width - sn.length + 1).join(' ') + sn;
}
