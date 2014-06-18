/*
Requirements:
* different defaults per exec context (e.g. unittests vs. live)
* local overrides that
** don't modify checked-in files
** can be different per exec context
** easy to switch via the comment line

Implentation: Follow these steps:

1. Load default config:
if NODE_ENV is set, look in that ./NODE_ENV/config
if module doesn't exists or NODE_ENV is not set, look in ./config

2. load local config:
if CONFIGDIR is set look in that directory else look for //config//.local.js in directory from step one

3. if local is found merge default and local
*/

var _ = require('underscore');
var path  = require('path');

function safeRequire(path) {
  try {
    return require(path);
  } catch (err) {
    if (err.code == "MODULE_NOT_FOUND") {
      return null;
    } else {
      throw err;
    }
  }
}

module.exports = function(configname) {
  var defaultconfig = null;
  var defaultdir = null;
  //note: ".." because this file lives "lib" not the root
  if (process.env.NODE_ENV) {
    defaultdir = '../'+ process.env.NODE_ENV + '/config/'
    defaultconfig = safeRequire(defaultdir + configname)
  }
  if (defaultconfig === null) { //no NODE_ENV or file not found
    defaultdir = '../config/';
    //note: at this point file must exist
    defaultconfig = require(defaultdir + configname)
  }

  var localconfig = null;
  if (process.env.CONFIGDIR) {
    localconfig = safeRequire(path.join(path.resolve(process.env.CONFIGDIR), configname))
  } else {
    localconfig = safeRequire(defaultdir + configname + '.local')
  }
  return _.defaults(localconfig || {}, defaultconfig)
}
