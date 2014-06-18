/**
 *
 * @example
 * // foobar = '<p>'
 * {% clientrender %}
 * // => 
 *
 */
exports.compile = function (compiler, args) {
  return "_output += _ext.renderClientside(_ctx);"
};
exports.parse = function (str, line, parser) {
  parser.on('*', function (token) {
    throw new Error('Unexpected token "' + token.match + '" in clientrender tag on line ' + line + '.');
  });
  return true;
};
