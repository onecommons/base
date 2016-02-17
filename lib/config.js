/*
Requirements:
* different defaults per exec context (e.g. unittests vs. live)
* local overrides that
** don't modify checked-in files
** can be different per exec context
** easy to switch via the command line

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
var defaultsDeep = require('lodash.defaultsdeep');
var path  = require('path');

var startjson = /^(\d|\{|\[|"|null|true|false)/;


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
  //put NODE_ENV in the path if it's set
  if (process.env.NODE_ENV) {
    defaults.dir =  path.join(basedir, process.env.NODE_ENV, 'config');
    defaults.config = safeRequire(path.join(defaults.dir,configname))
  }
  if (!defaults.config) { //no NODE_ENV or file not found
    defaults.dir = path.join(basedir, 'config');
    defaults.config = safeRequire(path.join(defaults.dir,configname))
  }
  return defaults;
}

/**
@param overrides (optional): dictionary<config name, defaults>
@param paths: (optional) list of paths to search (default: "..")
@param configname: (optional) if not supplied, returns a function
*/
module.exports = function() {
  var args = Array.prototype.slice.call(arguments)
  var overrides;
  if (typeof args[0] === 'object') {
    overrides = args.shift();
  } else {
    overrides = global.configOverrides || {};
  }
  var paths;
  if (Array.isArray(args[0])) {
    paths = args.shift();
  } else {
    // note: ".." because this file lives "lib" not the root
    paths = global.configPaths || ['..'+path.sep];
  }
  var configname = args[0];
  var reload = args[1];
  var cache = {};
  var configLoader = function(configname, reload) {
    if (!reload && cache[configname]) //do this for consistency as much as for efficiency
      return cache[configname];
    //get an array of config objects found on the path
    var configinfo = paths.map(function(p) {
      return loaddefaults(p, configname);
    })
    var defaultss = _.compact(_.pluck(configinfo, 'config'));

    var localconfig = null;
    if (process.env.CONFIGDIR) { //look in CONFIGDIR
      localconfig = safeRequire(path.join(path.resolve(process.env.CONFIGDIR), configname));
    } else {
      // look for <config>.local in most derived directory:
      // always look in NODE_ENV first and then also look in root if a config was found there
      if (configinfo[0].config && configinfo[0].dir == path.join(paths[0], 'config')) {
        //config was found in root, check both NODE_ENV/config and /config
        localconfig = loaddefaults(paths[0], configname + '.local').config;
      } else {
        localconfig = safeRequire(path.join(paths[0], process.env.NODE_ENV || '', 'config', configname + '.local'));
      }
    }
    if (localconfig)
      defaultss.unshift(localconfig); //add localconfig to config array
    if (overrides[configname])
      defaultss.unshift(overrides[configname])

    var rx = new RegExp('^' + configname.toUpperCase()+'_(.+)');
    var envconfig = {};
    var envKeys = Object.keys(process.env);
    //we want to sort so that more specific keys are applied last
    envKeys.sort();
    _(envKeys).each(function(key) {
      var m = key.match(rx);
      if (m) {
        var current = envconfig;
        var names = m[1].split('__');
        var name = null;
        for (;;) {
          name = names.shift();
          if (names.length) {
            var obj;
            var type = typeof current[name];
            if (type === 'object')
              obj = current[name];
            else if (type !== 'undefined')
              return //XXX log error
            else
              current[name] = obj = {};
            current = obj;
          } else {
            break
          }
        }

        var value = process.env[key];
        if (value.match(startjson)) {
          try {
            value = JSON.parse(value);
          } catch (e) {}; //XXX log error
        }

        current[name] = value
      }
    }); //end each()
    defaultss.unshift(envconfig);

    //merge config array
    var config =  defaultsDeep.apply(defaultsDeep, defaultss);
    cache[configname] = config;
    return config;
  };
  configLoader.paths = paths;
  if (configname) {
    return configLoader(configname, reload);
  }
  return configLoader;
}
