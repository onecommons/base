// usage: var config = require('base/lib/config-webpack-loader?app!');
// see http://webpack.github.io/docs/loaders.html#loader-context and http://webpack.github.io/docs/how-to-write-a-loader.html

module.exports = function() {
  // XXX should mark config file paths as dependencies but this requires adding api to the config module
  this.cacheable(true);
  var config = require(__dirname+'/config')(this.query.slice(1));
  return "module.exports = " + JSON.stringify(config) + ';';
};
