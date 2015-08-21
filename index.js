//require("babel/register");
if (process.env.SRC_base) {
  var path = require('path');
  module.exports = require(path.join(path.resolve(process.env.SRC_base), 'lib/app'));
} else {
  module.exports = require('./lib/app');
}

// check to see if we're the main module (i.e. run directly, not require()'d)
if (require.main === module) {
  module.exports.createApp(__dirname).start();
}
