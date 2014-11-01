var _    = require('underscore');
var path = require('path');
var fs   = require('fs');
var exists = fs.existsSync || path.existsSync;
var Promise = require('promise');

   // like the python dictionary pop.
   // return obj[prop] and remove property from obj.
   // if obj[prop] doesn't exist, return default value.
exports.pyPop = function (obj, prop, defaultValue){
   obj = (obj === undefined) ? {} : obj;

   if(obj.hasOwnProperty(prop)){
       var rv =  obj[prop];
       delete obj[prop];
       return rv;
   } else {
       return defaultValue;
   }
}

// useful type determination: Function, Object, string, number, Array, null, undefined, RegExp.
exports.trueTypeof = function(value) {
    if (value === null) {
        return "null";
    }
    var t = typeof value;
    switch(t) {
        case "function":
        case "object":
            if (value.constructor) {
                if (value.constructor.name) {
                    return value.constructor.name;
                } else {
                    // Internet Explorer
                    // Anonymous functions are stringified as follows: 'function () {}'
                    // => the regex below does not match
                    var match = value.constructor.toString().match(/^function (.+)\(.*$/);
                    if (match) {
                        return match[1];
                    }
                }
            }
            // fallback, for nameless constructors etc.
            return Object.prototype.toString.call(value).match(/^\[object (.+)\]$/)[1];
        default:
            return t;
    }
};

exports.getTimeLeft = function(target_date) {
  var difference = target_date - new Date();

  // basic math variables
  var _second = 1000,
    _minute = _second * 60,
    _hour = _minute * 60,
    _day = _hour * 24;

  // calculate dates
  var days = Math.floor(difference / _day),
    hours = Math.floor((difference % _day) / _hour),
    minutes = Math.floor((difference % _hour) / _minute),
    seconds = Math.floor((difference % _minute) / _second);

  // fix dates so that it will show two digits
  days = (String(days).length >= 2) ? days : '0' + days;
  hours = (String(hours).length >= 2) ? hours : '0' + hours;
  minutes = (String(minutes).length >= 2) ? minutes : '0' + minutes;
  seconds = (String(seconds).length >= 2) ? seconds : '0' + seconds;

  return [days, hours, minutes, seconds];
}


// route middleware to make sure a user is logged in
//adds "user" to view variables (res.locals)
var isLoggedIn = function(doRecentCheck, req, res, next) {
  var app = req.app;
  var config = app.loadConfig('auth');

  var failed = !req.isAuthenticated();
  if (!failed && doRecentCheck) {
    //note: loginTime maybe a string since sessions are serialized as json
    failed = !req.session.loginTime ||
      !(new Date() - new Date(req.session.loginTime) <= config.recentLoginTimeoutSeconds*1000);
    if (failed) { //force reauthentication (e.g. for facebook login for example)
      req.session.reauthenticate  = true;
    }
  }

  // if user is not authenticated, redirect to login
  if (failed) {
    // remember original requested url
    req.session.returnTo = req.url;
    res.redirect('/login');
    return;
  }

  res.locals.user = req.user; //expose user to templates

  // user may appear logged in but with an unconfirmed account
  // redirect to the email verification page
  if (config.requireEmailVerification
      && isDefined(req, 'user.local.verified') && !req.user.local.verified) {
    console.log("local user has not been verified!");
    res.redirect('/verification');
    return;
  }

  return next();
}

function requirePermission(permission, req, res, next) {
  var checker = req.app.accessControl;
  var user = req.user || checker.policy.defaultPrinciple;
  if (!user || !checker.check(user, req, permission)) {
    res.status(403).send("Permission Denied");
    //res.redirect('/accessdenied'); //or 403 ?
    return;
  }
  return next();
}

// route middleware to make sure a user is logged in
exports.isLoggedIn = _.partial(isLoggedIn, false);

// route middleware to make sure a user is logged in
exports.isRecentlyLoggedIn = _.partial(isLoggedIn, true);

// route middleware to make sure a user has permission
exports.requirePermission = function(guard) { return _.partial(requirePermission, guard); }

exports.renderer = function(view) {
  return function(req, res) { res.render(view);};
};

exports.eatErr = function(cb) {
  var startstack = new Error().stack;
  return function() {
    try {
      return cb.apply(cb, arguments);
    } catch (err){
      console.log("caught error:", err.stack);
      console.log("callback set at:", startstack);
    }
  }
};

exports.searchPath = function(paths, local) {
  for (var i=0; i< paths.length; i++) {
    var test = path.join(paths[i], local);
    if (exists(test)) {
      return test;
    }
  }
  throw new Error(local + " not found on " + JSON.stringify(paths));
}

// check for nested object properties
var isDefined = exports.isDefined = function(obj, propertyPath) {
  var target = obj;
  var props = propertyPath.split('.');
  for (var i = 0; i < props.length; i++) {
    var propName = props[i];
    if (typeof(target) == 'object' && propName in target) {
      target = target[propName];
    } else {
      return false;
    }
  };
  return true;
}

/*
Returns a promise that resolves any values that are promises.
Semantics are the same as Promise.all().
*/
exports.resolvePromises = function(obj) {
  var keys = _(obj).keys(), values = _(obj).values();
  return Promise.all(values).then(function(result) {
    return _.object(keys, result);
  });
}

exports.exportModel = function(exports, schema) {
 exports.schemas[schema.metadata.modelName] = schema
 //lazily get models
 Object.defineProperty(exports.models, schema.metadata.modelName, {
    get: function() { return schema.getModel();}
 });
 Object.defineProperty(exports, schema.metadata.modelName, {
   get: function() { return schema.getModel();}
 });
}
