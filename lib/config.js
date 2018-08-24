/*
Requirements:
* different defaults per exec context (e.g. unittests vs. live)
* local overrides that
** don't modify checked-in files
** can be different per exec context
** easy to switch via the command line

Configuration is constructed by merging the following:

1 environment variables
2 overrides passed as arguments
3. local config files along search path
4. default config files along search path

The factory function sets a search path, defaults to [__dirname/..]

Loading a config file on the search path follows these steps:

For each dir on the path, try to load a config:
if NODE_ENV is set, look in that ./NODE_ENV/config
if module doesn't exists or NODE_ENV is not set, look in ./config
*/

var _ = require('underscore');
var mergeWith = require('lodash.mergewith');
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

// https://stackoverflow.com/questions/19965844/lodash-difference-between-extend-assign-and-merge
function customDefaultsMerge(objValue, srcValue, key, object, source, stack) {
  if (_.isArray(objValue)) { // don't merge arrays
    return srcValue;
  } else if (_.isObject(objValue) && objValue._mergeStrategy == 'replace') {
    if (_.isObject(srcValue)) {
      Object.defineProperty(srcValue, '_mergeStrategy', {
        value: 'replace', configurable: true
      });
    }
    return srcValue;
  }
  else if (_.isObject(srcValue) && srcValue._mergeStrategy == 'replace') {
    return srcValue;
  }
  return undefined;
}
function defaultsDeep(args) {
  // we do it like this so none of the objects in args are modified
  var result = {};
  console.log('huh', args)
  for (var i = args.length-1; i >= 0; i--) {
    mergeWith(result, args[i], customDefaultsMerge);
  }
  return result;
}

function loaddefaults(basedir, configname) {
  var filepath, defaults = {};
  //put NODE_ENV in the path if it's set
  if (process.env.NODE_ENV) {
    filepath = path.join(basedir, process.env.NODE_ENV, 'config',configname);
    defaults.config = safeRequire(filepath);
  }
  if (!defaults.config) { //no NODE_ENV or file not found
    filepath = path.join(basedir, 'config',configname);
    defaults.config = safeRequire(filepath,configname);
  }
  if (defaults.config) {
    defaults.path = filepath;
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
  if (typeof args[0] === 'object' && !Array.isArray(args[0])) {
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
    var localConfiginfo = paths.map(function(p) {
      return loaddefaults(p, configname + '.local');
    })
    var defaultConfiginfo = paths.map(function(p) {
      return loaddefaults(p, configname);
    })
    //XXX the order here is wrong: local should just override after the corresponding config path
    var configinfo = localConfiginfo.concat(defaultConfiginfo);
    var defaultss = _.compact(_.pluck(configinfo, 'config'));
    var sources = _.compact(_.pluck(configinfo, 'path'));

    if (overrides[configname]) {
      defaultss.unshift(overrides[configname])
    }

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
    var config = defaultsDeep(defaultss);
    config.configSources = sources;
    cache[configname] = config;
    return config;
  };
  configLoader.paths = paths;
  if (configname) {
    return configLoader(configname, reload);
  }
  return configLoader;
}
