module.exports = (val, length) ->
  val += ''
  numPads = length - val.length
  if (numPads > 0) then new Array(numPads + 1).join(' ') + val else val
