export default function leftPad(n, width) {
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(' ') + n;
}
