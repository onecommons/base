if (process.env.BASESRC) {
  var path = require('path');
  module.exports = require(path.join(path.resolve(process.env.BASESRC), 'lib/app'));
} else {
  module.exports = require('./lib/app');
}

// check to see if we're the main module (i.e. run directly, not require()'d)
if (require.main === module) {
  module.exports.createApp(__dirname).start();
}
