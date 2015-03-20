/*
This module provides a simple interface to an application-configured logging facility.
The logging facilities currently supported are bunyan and a wrapper around console.log.

In addition to providing a uniform interface to different log facilities,
using this module to access the log facility will avoid order of initiation issues
(e.g. the log object is referenced before the logger is instantiated).
In the future it may provide transparent access to per-zone or "continuation local storage" log objects.

Also provides a middleware for associating a logger with requests so log events can be correlated
and middleware for logging requests, including support for morgan and structured logging.

example:

var log = require('log');
log.info("this happened %s", foo);
log.error(new Error(), "something when wrong");
*/

var util = require('util');
var uuid = require('node-uuid');
var _ = require('underscore');
var slice = [].slice;

//from bunyan:
var levels = module.exports.levels = {
"fatal": 60, //The service/app is going to stop or become unusable now. An operator should definitely look into this soon.
"error": 50, // Fatal for a particular request, but the service/app continues servicing other requests. An operator should look at this soon(ish).
"warn": 40, //A note on something that should probably be looked at by an operator eventually.
"info": 30, //Detail on regular operation.
"debug": 20, //Anything else, i.e. too verbose to be included in "info" level.
"trace": 10 //Logging from external libraries used by your app or very detailed application logging.
};

function SimpleLogger(meta) {
  this.output = console.log;
  if (meta && meta.level) {
    this.level = typeof meta.level === 'string' ?
          exports.levels[meta.level.toLowerCase()] : meta.level;
    delete meta.level;
  }
  this.metadata = typeof meta === 'string' ? {name:meta} : meta;
  var logger = this;
  Object.keys(exports.levels).forEach(function(name) {
    logger[name] = function() {
      this._log(name, arguments);
    }
  });

  this.child = function(meta) {
    if (this.metadata && meta)
      _.defaults(meta, this.metadata);
    var child = new SimpleLogger(meta || this.metadata);
    child.output = this.output;
    //if level wasn't already set inherit from parent
    if (child.level === void 0)
      child.level = this.level;
    return child;
  }
}
module.exports.SimpleLogger = SimpleLogger;

SimpleLogger.prototype._log = function(level, args) {
  try {
    if (this.level && exports.levels[level] < this.level)
      return;

    var argOffset = 0;
    var extra = (this.metadata ? ' ' + util.inspect(this.metadata) + ':': '') + ' ';
    var first = args[0];
    if (typeof first === 'object') {
      ++argOffset;
      extra += util.inspect(first) + ' ';
    }

    this.output('[' + new Date().toUTCString() + '] ' + level.toUpperCase()
      + extra + util.format.apply(null, slice.call(args, argOffset)))
  } catch (err) {
    console.error('exception while logging', err, err.stack);
  }
}

module.exports.logger = module.exports.defaultLogger = new SimpleLogger();

//proxy to the current logger
Object.keys(levels).forEach(function(name) {
  Object.defineProperty(module.exports, name, {
     get: function() {
        return exports.logger[name].bind(exports.logger);
     }
  });
});
Object.defineProperty(module.exports, 'child', {
   get: function() {
      return exports.logger.child.bind(exports.logger);
   }
});

module.exports.useReqLog = function(opt_) {
  var opt = opt_ || {};
  return function(req, res, next) {
    var logger = req.app.log;
    if (typeof req.id === 'undefined')
      req.id = uuid.v4();
    opt.req_id = req.id;
    var childLogger = logger.child(opt, !opt_);
    req.log = childLogger;
    return next()
  }
}

module.exports.requestLoggers = {
  morgan: function(app, options) {
    var morgan = require('morgan'); //formerly known as express.logger()
    app.use(morgan(_.defaults(options||{},{format: 'dev', immediate: true })));
    app.use(morgan(_.defaults(options||{},{format: 'dev'})));
  },

  logger: function(app, options) {
    app.use(logRequest);
  }
}

/*
logs request twice:
DEBUG request (immediate)
INFO  or WARN or ERROR after response
*/
function logRequest(req, res, next) {
  var startTime = process.hrtime();
  var childLogger = req.log;

  ///bin/bunyan has special for for 'req' records, so create one for its consumption
  var requestInfo = {
    req: {
      httpVersion: req.httpVersionMajor + '.' + req.httpVersionMinor,
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      remoteAddress: req.ip || req._remoteAddress || req.connection.remoteAddress,
      remotePort: req.connection.remotePort,
      //body: req.body XXX should handle max size
    },
    sessionID: req.sessionID,
    userId: req.user && req.user.id,
  };
  childLogger.debug(requestInfo, "%s %s", req.method, req.url);

  res.on('finish', logging);
  res.on('close', logging);

  next();

  function logging() {
    res.removeListener('finish', logging);
    res.removeListener('close', logging);

    var hrtime = process.hrtime(startTime);
    responseTimeMs = hrtime[0] * 1e3 + hrtime[1] / 1e6;
    var responseInfo = {
      method: req.method,
      url: req.originalUrl || req.url,
      sessionID: req.sessionID,
      userId: req.user && req.user.id,
      statusCode: res.statusCode,
      responseTime: responseTimeMs,
      bytes: (res._headers || {})['content-length']
    };
    childLogger[defaultLevelFn(res.statusCode)](responseInfo,
      "%s %s %s %s ms", req.method, req.url, res.statusCode, responseTimeMs);
  }
}


function defaultLevelFn(status) {
    if (status >= 500) { // server internal error or error
        return "error";
    } else if (status >= 400) { // client error
        return "warn";
    }
    return "info";
}
