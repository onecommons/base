var _    = require('underscore');
var path = require('path');
var fs   = require('fs');
var exists = fs.existsSync || path.existsSync;
var Promise = require('promise');

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
var isLoggedIn = function(doRecentCheck, req, res, next) {
  var app = req.app;
  var config = app.loadConfig('auth');

  var failed = !req.isAuthenticated();
  if (!failed && doRecentCheck && !req.session.impersonated) {
    //skip recent check if login is impersonated
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
    req.session.returnToMethod = req.method;
    req.flash('login.danger', req.session.reauthenticate ? 'You need to login again to access this page.' : 'You need to login to access this page.');
    res.redirect('/login');
    return;
  }

  if (config.requireEmailVerification
      && isDefined(req, 'user.local.verified') && !req.user.local.verified) {
    if (config.requireEmailVerification == 'nag') {
      req.flash('warning', 'Please confirm your email address by clicking the link sent to <strong>'+ req.user.local.email +"</strong>.&nbsp;&nbsp;<a class='send-resend' href='#'>Resend confirmation email</a>.");
    } else if (config.requireEmailVerification == 'require') {
      // redirect to the email verification page
      req.session.returnTo = req.url;
      req.session.returnToMethod = req.method;
      res.redirect('/verification-required');
      return;
    }
  }

  return next();
}

function requirePermission(permission, req, res, next) {
  var checker = req.app.accessControl;
  var user = req.user || checker.policy.defaultPrinciple;
  var ok = user && checker.check(user, req, permission);
  //just return if not called as middleware
  if (!next)
    return ok;

  if (!ok) {
    res.statusCode = 403;
    return next(new Error("Permission Denied"));
  }
  return next();
}

// route middleware to make sure a user is logged in
exports.isLoggedIn = _.partial(isLoggedIn, false);

// route middleware to make sure a user is logged in
exports.isRecentlyLoggedIn = _.partial(isLoggedIn, true);

// route middleware to make sure a user has permission
exports.requirePermission = function(guard) { return _.partial(requirePermission, guard); }

//check whether the user associated with the request has permission
exports.checkPermission = requirePermission;

exports.renderer = function(view, vars) {
  return function(req, res) { res.render(view, vars);};
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

exports.popAlertMessages = function(flashfunc, types, scopes) {
  var alerts = null;
  scopes = Array.isArray(scopes) ? scopes : [scopes];
  types = Array.isArray(types) ? types : [types];
  types.forEach(function(type){
    var msgs = [];
    scopes.forEach(function(scope) {
      flashfunc((scope ? scope + '.' : '')+type).forEach(function(msg) {
        if (msgs.indexOf(msg) == -1) { //skip duplicates
          msgs.push(msg);
        }
      });
    });

    if (msgs.length) {
      if (!alerts) alerts = {};
      alerts[type] = msgs;
    }
  });
  return alerts;
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

/*
Run a list of promises sequentially.

@param stack A list of functions that return promises

Returns promise that resolves when the last promise does.
*/
exports.chainPromises = function(stack) {
//(stack) => stack.reduce((cb,p) => p.then((result) => cb(result)), Promise.resolve())
  var p = Promise.resolve();
  stack.forEach(function(cb){
    p = p.then(function(result) { return cb(result)})
  });
  return p;
}

/*
Like Promise.all() except rejected promises don't abort, instead are passed
through regular results.

@param promises Array of promises
@param onerror (optional) function called to resolve a rejection. (default: returns the rejection)
*/
exports.safeAllPromises = function(promises, onerror) {
  if (!onerror)
    onerror = function(err) { return err; };
  return Promise.all(promises.map(function (p){
    if (p && p.catch) //only if p is a promise
      return p.catch(onerror);
    else
      return p;
  }));
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
