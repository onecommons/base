var _               = require('underscore');
var path = require('path');
var fs = require('fs');
var exists = fs.existsSync || path.existsSync;

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
exports.isLoggedIn = function(req, res, next) {

  // if user is not authenticated, redirect to login
  if (!req.isAuthenticated()) {
    // remember original requested url
    req.session.returnTo = req.url;
    res.redirect('/login');
    return;
  }

  // user may appear logged in but with an unconfirmed account
  // redirect to the email verification page
  if (isDefined(req, 'user.local.verified') && !req.user.local.verified) {
    console.log("local user has not been verified!");
    res.redirect('/verification');
    return;
  }

  return next();
}

// vars set here are available on all pages with sharedPageVars in the route
exports.sharedPageVars = function(req, res, next) {
  console.log("deprecated; dont use this, it no longer does anything");
  next();
}

exports.renderer = function(view) {
  return function(req, res) { res.render(view);};
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
