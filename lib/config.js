/*
Requirements:
* different defaultss per exec context (e.g. unittests vs. live)
* local overrides that
** don't modify checked-in files
** can be different per exec context
** easy to switch via the comment line

Implentation: Follow these steps:

1. factory function sets a search path, defaults to [__dirname/..]

2. For each dir on the path try to load defaults configs:
if NODE_ENV is set, look in that ./NODE_ENV/config
if module doesn't exists or NODE_ENV is not set, look in ./config

3. merge defaultss configs

4. load local config:
if CONFIGDIR is set look in that directory else look for //config//.local.js following step two

5. if local is found merge defaults and local
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

function loaddefaults(basedir, configname) {
  var defaults = {};
  if (process.env.NODE_ENV) {
    defaults.dir =  path.join(basedir, process.env.NODE_ENV, 'config');
    defaults.config = safeRequire(path.join(defaults.dir,configname))
  }
  if (!defaults.config) { //no NODE_ENV or file not found
    defaults.dir = path.join(basedir, 'config');
    //note: at this point file must exist
    defaults.config = safeRequire(path.join(defaults.dir,configname))
  }

  return defaults;
}

/**
@param arguments: search path
*/
module.exports = function() {
  //note: ".." because this file lives "lib" not the root
  var paths = arguments.length ? Array.prototype.slice.call(arguments) : ['..'+path.sep];
  var cache = {};
  var configLoader = function(configname, reload) {
    if (!reload && cache[configname]) //do this for consistency as much as for efficiency
      return cache[configname];
    var defaultss = _.compact(paths.map(function(p) {
      return loaddefaults(p, configname).config;
    }));

    var localconfig = null;
    if (process.env.CONFIGDIR) { //look in CONFIGDIR
      localconfig = safeRequire(path.join(path.resolve(process.env.CONFIGDIR), configname));
    } else { //look in <config>.local
      localconfig = loaddefaults(paths[0], configname + '.local').config;
    }
    if (localconfig)
      defaultss.unshift(localconfig);
    var config =  _.defaults.apply(_, defaultss);
    //XXX check process.env and cooerce
    cache[configname] = config;
    return config;
  };
  configLoader.paths = paths;
  return configLoader;
}
