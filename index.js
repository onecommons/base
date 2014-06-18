module.exports = require('./lib/app');

// check to see if we're the main module (i.e. run directly, not require()'d)
if (require.main === module) {
  module.exports.createApp().start();
}
