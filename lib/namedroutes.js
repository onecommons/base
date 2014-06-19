var _               = require('underscore');
var assert = require('assert');

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

function applyRoute(route, base) {
  base = base || '/';
  if (base.slice(-1) != '/')
    base += '/';
  var path = base + route.path;
  if (route.route) { //nested routes
    applyRoutes(route.route, path);
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

function applyRoutes(routes, base) {
  for (var route in routes) {
    if (!routes.hasOwnProperty(route)) continue;
    applyRoute(routes[route]);
  }
}

//expand source and target then merge,
//if source and target are both have route recurse
//XXX if one or the the have route replace target with source
//otherwise merge source keys into target, if source key has falsy value, remove the key
//if handle is being added assume its the current app unless app is specified?
function update(app, target, source) {
    target = target || {};
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
              _.extend(target[prop], def);
            }
        } else if (!def.pathonly) {
          if (typeof def.path === 'undefined')
            def.path = prop; //use name as path
          target[prop] = def;
        }
    }
    return target;
}

module.exports = {
  update: update,
  apply: applyRoutes
};
