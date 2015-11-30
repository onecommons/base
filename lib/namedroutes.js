var _               = require('underscore');
var assert = require('assert');
var path = require('path');

//expand source and target then merge,
//if source and target are both have route recurse
//XXX if one or the the have route replace target with source
//otherwise merge source keys into target, if source key has falsy value, remove the key
//if handle is being added assume its the current app unless app is specified?
function update(app, target, source) {
    for (var prop in source) {
        if (!source.hasOwnProperty(prop)) continue;
        var def = expandDefinition(app, prop, source[prop]);
        if (prop in target) {
            if (!def) {
              delete target[prop];
            } else if (def.route) {
              debugger; //XXX
            } else if (def.pathonly) {
              target[prop].path = def.path;
            } else {
              //use defaults() instead of extends() so undefined are skipped
              target[prop] = _.defaults({}, def, target[prop]);
            }
        } else if (!def.pathonly) {
          if (typeof def.path === 'undefined')
            def.path = prop; //use name as path
          target[prop] = def;
        }
    }
    return target;
}

function applyRoute(route, base, pre, name) {
  base = base || '/';
  if (base.slice(-1) != '/')
    base += '/';
  var path = base + route.path;
  if (pre)
    route = pre(route, name);
  if (route.route) { //nested routes
    applyRoutes(route.route, path, pre);
  } else {
    var app = route.app;
    assert(app);
    for (var key in route) {
      if (key == "path" || key == 'app' || !app[key])
        continue;
      //call app.METHOD(path, ...route[METHOD]):
      app[key].apply(app, [path].concat(route[key]));
    }
  }
}

function applyRoutes(routes, base, pre) {
  for (var route in routes) {
    if (!routes.hasOwnProperty(route)) continue;
    applyRoute(routes[route], base, pre, route);
  }
}

function NamedRoutes() {};
module.exports = NamedRoutes;

NamedRoutes.prototype = {
  //XXXs use PATH_REGEXP in https://github.com/component/path-to-regexp/blob/master/index.js for a complete solution
  PARAMREGEX: /(?=[^\\]|^)\:(\w+)/,

  applyRoutes: function(pre) {
    if (pre && Array.isArray(pre)) {
      if (pre.length) {
        //chain functions
        pre = pre.reduce(function(ff, f) { return function(route, name) { return ff(f(route, name), name);}});
      } else {
        pre = null;
      }
    }
    return applyRoutes(this, null, pre);
  },

  updateRoutes: function(app, source) {
    return update(app, this, source);
  },

  getUrlMap: function() {
    var PARAMREGEX = this.PARAMREGEX,
      PARAMREGEXG = new RegExp(PARAMREGEX.source, 'g');
    return _.object(_.map(this,
      function(value, key){
        var urlpath = path.join('/', value.path);
        var resolved;
        if (value.path.match(PARAMREGEX)) {
          //generate a function that builds the url given an object
          resolved = function(obj) {
            return urlpath.replace(PARAMREGEXG, function(param, name) {
              return encodeURIComponent(obj[name]||'');
            });
          }
        } else {
          resolved = urlpath;
        }
        return [key, resolved];
      }));
  },

  getUrlMapSource: function() {
    var PARAMREGEX = this.PARAMREGEX;
    return JSON.stringify(_.object(_.map(this,
      function(value, key){
        var urlpath = path.join('/', value.path);
        var resolved;
        if (value.path.match(PARAMREGEX)) {
          resolved = "@@@"+ urlpath + "@@@";
        } else {
          resolved = urlpath;
        }
        return [key, resolved];
      }))).replace(/"@@@(.+?)@@@"/g, 'function(obj) {return "$1".replace(/'
         + PARAMREGEX.source +'/g, function(p, n) { return encodeURIComponent(obj[n]||"");});}'
      );
  }

};

/*
If path is omitted the name of the route is used as the path
If method is ommitted, GET is used
*/
function expandDefinition(app, name, route) {
  if (!route)
    return null;
  if (typeof route === 'function') {
    return {
      app: app,
      get: [route]
    }
  } else if (Array.isArray(route)) {
    var path = undefined, funcs;
    if (typeof route[0] !== 'string') {
      funcs = route;
    } else {
      path = route[0];
      funcs = route.slice(1);
    }
    return {
      app: app,
      path: path,
      get: funcs
    }
  } else if (route.route) { //nested routes
    debugger; //XXX
  } else {
    var def = {
      app: app,
      path: route.path
    };
    var found = false;
    for (var key in route) {
      if (key == "path" || key == 'app' || !app[key])
        continue;
      def[key] = (!route[key] || Array.isArray(route[key])) ? route[key] : [route[key]];
      found = true;
    }
    if (!found) {
      def.pathonly = true;
      if (typeof route.path === 'undefined')
        def.path = name
    }
    return def;
  }
}
