/**
 * Module dependencies.
 */
var express = require('express');
var View = require('express/lib/view');
var routes = require('../routes');
var path = require('path');
var swig = require('swig');
//var mongoose = require('mongoose');
var passport = require('passport');
var flash = require('connect-flash');
var models = require('../models');
var _ = require('underscore');
var configloader = require('./config');
var utils = require('./utils');
var NamedRoutes = require('./namedroutes');
var util = require('util');
var crypto = require('crypto');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session      = require('express-session');
var errorhandler = require('./errorhandler');
var path  = require('path');
var assert = require('assert');
var createModel = require('./createmodel');
var access = require('./access');
var Promise = require('promise');
var dataform = require("./dataForm");
var https = require('https');
var log = require('./log');
var moment = require('moment-timezone');
var url = require('url');

var __theApp = null;

/**
@params options Either a string, array or dictionary
*/
function getConfigLoader(options) {
  if (typeof options === 'string' || Array.isArray(options)) {
    options = {configdir: options};
  }
  options =  _.defaults(options || {}, {
     configdir:       '',
     configOverrides: {},
  });
  global.configOverrides = options.configOverrides;
  var paths;
  if (Array.isArray(options.configdir)) {
    paths = options.configdir.map(function(e) {return path.resolve(e)});
  } else {
    paths = [path.resolve(options.configdir)];
  }
  paths.push(path.join(__dirname, '..'));
  global.configPaths = paths;
  return configloader(options.configOverrides, global.configPaths);
}

function _getViewPath(views) {
  var viewpath = [];
  if (views) {
    if (Array.isArray(views)) {
      viewpath = views.map(function(e) {return path.normalize(e)});
    } else {
      viewpath = [path.normalize(path.join(views, path.sep))];
    }
  }

  // use '..' cause __dirname is in ./lib
  var baseviewpath = path.normalize(path.join(__dirname, '..', 'views', path.sep));
  return viewpath.concat(baseviewpath);
}

/*
Allow views to search a unix-like path for file resolution
*/
function AppView(name, options) {
  View.call(this, name, options);
}
util.inherits(AppView, View);

AppView.prototype.lookup = function(locate) {
  //rely on template engine loader to resolve relative path
  return locate;
}

AppView.prototype.render = function(options, fn){
  options.routes = this.app.get("namedRouteUrls");
  var tz = options.displayTz || this.app.config.displayTz;
  if (tz && tz.match(/^[^+\-Z]/)) {
    //if it's a timezone not an offset convert to offset
    //(need to do everytime to handle daylight saving time changes)
    var dateWithTz = moment().tz(tz);
    tz =  dateWithTz.format('Z');
    //reverse offset like Date.getTimezoneOffset() returns
    options.tzOffset =  dateWithTz.utcOffset() * -1;
  } else {
    options.tzOffset = 0;
  }
  options.df = dataform.dataform({
    // default to GMT
    tz: tz || 'Z'
  });
  this.engine(this.path, options, fn);
};

var STOP_APP_TIMEOUT = 30*1000;

var appmethods = {

 _useStaticPaths: function() {
  var app = this;
  //use '..' cause we're in lib
  var staticpath = path.join(__dirname, '..', 'public');
  app.use(require('less-middleware')(staticpath,{
    //debug: true,
  }));
  app.use(express.static(staticpath));

  var publicpath = app.get('publicpath');
  if (publicpath) {
    app.use(require('less-middleware')(publicpath,{
      //debug: true,
    }));
    app.use(express.static(publicpath));
  }
},

/*
Configures cookie parsing and session middleware
*/
_configureSession: function() {
  var app = this;
  var config = app.config;
  var cookiesecret = config.cookie_secret;
  if (!cookiesecret) {
    cookiesecret = crypto.randomBytes(64).toString('base64');
    log.warn('no cookie_secret set in config/app.js, randomly choosing %s', cookiesecret);
  }
  app.use(cookieParser(cookiesecret));
  var sessionconfig = {
    secret: cookiesecret,
    resave: false,
    saveUninitialized: false,
  //the rolling feature doesn't impact how long session live on the server-side
  //but it does update the expire time on the session cookie
  //and as a side effect forces the session cookie to be set every request
  //without this the cookie for existing sessions will not be sent if it doesn't have an expires
  //but we need it to be in the case where we downgrade a persistent session to browser-session one
  //when the user logs in again without "rememberme" checked
  //(search for "debug('already set browser-session cookie');" in express-session)
    rolling: !!config.persistentSessionSeconds,
  };
  if (config.sessionfactory) {
    config.sessionfactory(sessionconfig, app, session);
  } else {
    // /es5 needed for node 0.10 and 0.12 compatibility
    var MongoStore = require('connect-mongo/es5')(session);
    sessionconfig.store = new MongoStore({
          url: config.dburl,
          //would be nice to save session natively but that fails if keys have '.' or '$'
          //stringify: false,
          //the session ttl if session.cookie.expires isn't set:
          ttl: config.browsersessionSessionSeconds
    });
  }
  //the session middleware works as follows:
  //if no req.session is set read sessionid out of session cookie and load the session
  //if session cookie isn't present generates a new session
  //at the end of the request the session is stored if modified and set-cookie header is sent

  //XXX express-session deprecated undefined resave option; provide resave option
  //express-session deprecated undefined saveUninitialized option; provide saveUninitialized option

  app.use(session(sessionconfig));
},

_setupBeforeStartListeners: function() {
  var app = this;
  var callbacks = [];
  var listen;

  /*
  Adds an listener that is invoked when the app is about to start.

  Listeners are invoked sequentially and if the listener returns a Promise the
  app will wait till it resolves before invoking the next listener.

  @param listener
  */
  app.addBeforeStartListener = function(callback) {
    callbacks.push(callback);
  };

  return function(listen) {
    var p = utils.chainPromises(callbacks);
    if (listen) {
      p = p.then(function() {
        return new Promise(function (resolve, reject) {
          var server = app.listen(app.get('port'), app.config.address || 'localhost', function() {
            log.info('Express server listening on %s:%d',server.address().address,server.address().port);
            resolve(server);
          });
          app.set('server', server);
        });
      });
      if (typeof listen == 'function') {
        p = p.then(listen);
      }
    };
    return p;
  }
},

mongooseDriverSchemes: {
  // 'debug' : path.resolve(__dirname, '../test/lib/mongoose-debug-driver')
},

_connectToDb: function() {
  var dburl  = this.get("dburl");
  log.debug("connecting to database", dburl);
  var mongooseDriverSchemes = this.mongooseDriverSchemes;
  return new Promise(function(resolve, reject) {
    var scheme = dburl.match(/^(\w+):/);
    var driverModulePath = scheme && mongooseDriverSchemes[scheme[1]];
    if (driverModulePath && global.MONGOOSE_DRIVER_PATH !== driverModulePath) {
      var mongooseMod = require.cache[require.resolve('mongoose')];
      if (mongooseMod) {
        var mod = mongooseMod;
        var parents = [];
        while (mod.parent) {
          parents.push(mod.parent.id);
          mod = mod.parent;
        }
        log.error("can't load mongoose driver, mongoose module already loaded by " + parents.join(' -> '));
        reject(new Error('mongoose module loaded before driver configuration'));
        return;
      }
      global.MONGOOSE_DRIVER_PATH = driverModulePath;
      //url has to start with mongodb
      dburl = dburl.replace(schema, 'mongodb');
    }
    var mongoose = require('mongoose');
    mongoose.connect(dburl, function(err) {
      if (err) {
        log.fatal("error connecting to database: %s", err.message);
        reject(err);
      }
      else {
        resolve();
      }
    });
 });
},

_disconnectFromDb: function() {
  return new Promise(function(resolve, reject) {
    require('mongoose').connection.close(function(err) {
      if (err)
        reject(err);
      else
        resolve();
    });
  });
},

/*
@param ready (optional) Equivalent of calling app.addBeforeStartListener(ready)
@param listen (optional) If boolean specifies whether or not the app starts listening.
  If a function, a callback that is invoke when the app starts listening.
  If omitted, defaults to true
*/
start: function(ready, listen) {
  if (typeof ready === 'boolean' && typeof listen === 'undefined') {
    listen = ready;
    ready = null;
  }
  listen = typeof listen === 'undefined' ? true : listen; //default to true
  var app = this;
  if (!app.userModel) //delay creation of the user model till now
    app.userModel = models.User;

  //////////add routes and final middleware//////////
  var routehooks = [];
  app.emit('namedroutes-install-hook', routehooks);
  app.get("namedRoutes").applyRoutes(routehooks);

  //we want this added after routes are applied:
  app._useStaticPaths();
  app.use(function(req, res) {
    res.statusCode = 404;
    res.render("error.html", {
       message: "Page Not Found",
       statusCode: 404
     });
  });
  app.use(errorhandler); //final error handler
  ///////end middleware/////////

  //set up clean shutdown on sigterm
  //see http://blog.argteam.com/coding/hardening-node-js-for-production-part-3-zero-downtime-deployments-with-nginx/
  //and https://github.com/visionmedia/express/issues/1366
  process.on( 'SIGTERM', function() {app.stop(null,true);});
  //XXX what about SIGINT (ctrl-c)? closeCallback needs to call process.exit(1) in that case
  if (ready)
    app.addBeforeStartListener(ready);
  return app._beforeStart(listen);
},

_setupBeforeStopListeners: function() {
  var app = this;
  var callbacks = [];

  /*
  Adds an listener that is invoked when the app is about to stop.
  Listeners are invoked sequentially and if the listener returns a Promise the
  app will wait till it resolves before invoking the next listener.

  @param listener
  @param first If true, the listener is added to the start of the list.
  */
  app.addBeforeStopListener = function(callback, first) {
    if (first)
      callbacks.unshift(callback);
    else
      callbacks.push(callback);
  }
  return _.partial(utils.chainPromises, callbacks);
},

/*
@param closeCallback invoked when app is terminated
returns a Promise that is resolved after the app is terminated.
*/
stop: function(closeCallback, forcequit, keepglobal) {
  if (!keepglobal && this === __theApp)
    __theApp = null;
  if (closeCallback)
    this.addBeforeStopListener(closeCallback);

  this.gracefullyExiting = true;
  var server = this.get("server");
  var p = this._beforeStop();
  if (server) {
    p = p.then(function() {
      return new Promise(function(resolve, reject) {
        server.close(function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
  if (forcequit) {
    var timeout = typeof forcequit == "number" ? forcequit : STOP_APP_TIMEOUT;
    setTimeout( function () {
      console.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, timeout);
  }
  return p;
},

/*
Internally accessible URL to access the app.
*/
getInternalUrl: function() {
  var server = this.get("server");
  if (!server)
    return null;
  var address = server.address();
  var scheme = server instanceof https.Server ? 'https' : 'http';
  return util.format("%s://%s:%d", scheme, address.address, address.port);
},

getExternalUrl: function() {
  return this.config.appurl || this.getInternalUrl();
},

updateNamedRoutes: function(routes) {
  var namedRoutes = this.get("namedRoutes") || new NamedRoutes();
  namedRoutes.updateRoutes(this, routes);
  var routes = namedRoutes.getUrlMap();
  this.set("namedRouteUrls", routes);
  this.set("namedRoutes", namedRoutes);
},

setupViews: function(options) {
  var app = this;
  var config = app.config;

  //create a custom view class bound to this app instance
  var appViewCtor = function(name, options) {
    AppView.call(this, name, options);
    this.app = app;
  }
  util.inherits(appViewCtor, AppView);
  app.set('view', appViewCtor);

  var viewpath = _getViewPath(options.views);
  app.set('views', viewpath);

  var cacheviews = config.cacheviews !== undefined ? config.cacheviews : options.cacheviews;
  if (cacheviews && typeof cacheviews === 'boolean')
    cacheviews = 'memory';
  require('./swigextensions')(swig, {
   loaderPath: viewpath,
   cache: cacheviews,
  });
  app.engine('html', swig.renderFile);
  app.set('view engine', 'html');
},

saveCurrentNamedRoute: function() {
  var app = this;
  app.addListener('namedroutes-install-hook', function(routehooks) {
    routehooks.push(function(route, name) {
      var val = route['get'];
      if (val) {
        val.unshift(function(req, res, next){
          if (req.session.parentNamedRoute) {
            res.locals.parentNamedRoute = req.session.parentNamedRoute;
          } else {
            var referer = req.get('Referer');
            // XXX should check hostname
            var refererPath = referer && url.parse(referer).pathname;
            if (refererPath && refererPath.indexOf(req.baseUrl) == 0) {
              refererPath = refererPath.slice(req.baseUrl.length);
            }
            res.locals.parentNamedRoute = refererPath && req.app.get("namedRoutes").findPath(refererPath);
          }
          res.locals.currentNamedRoute = route;
          return next();
        });
      }
      return route;
    })
  });
},

setupPrivateMode: function(){
  var app = this;
  if (!app.config.privatemode || app.config.privatemode.disable)
    return false;

  var whitelist = app.config.privatemode.whitelist || ['login', 'fbAuth'];
  function isInWhitelist(name) {
    if (Array.isArray(whitelist)) {
      return whitelist.indexOf(name) > -1;
    } else {
      return name.match(whitelist);
    }
  }

  function guard(req, res, next) {
    if (req.user || req.path.match(app.config.privatemode.pathWhitelist || /(login)|(auth)/)) {
      next();
    } else {
      req.session.returnTo = req.url;
      req.session.returnToMethod = req.method;
      if (app.config.privatemode.message) {
        req.flash(app.config.privatemode.messageScope || 'warning', app.config.privatemode.message);
      }
      res.redirect(app.config.privatemode.redirect || '/login');
    }
  }

  var methods = app.config.privatemode.methods || ['get']; //,'post','put','head','delete','options'];
  app.addListener('namedroutes-install-hook', function(routehooks) {
    routehooks.push(
      function(route, name) {
        var copy = {};
        if (isInWhitelist(name))
          return route;
        for (var key in route) {
          var val = route[key];
          if (methods.indexOf(key) > -1) {
            copy[key] = [guard].concat(val);
          } else {
            copy[key] = val;
          }
        }
        return copy;
      }
    );
  });
},

setupAccessControlPolicy: function() {
  models.schemas.User.add({
   roles: {type:[String], default: ['user']}
  });
  var policy = createModel.getAccessControlPolicy();
  this.accessControl = access.createPermissionsChecker(policy);
},

createDefaultAdmin: function() {
  var app = this;
  if (!app.config.defaultAdmin)
    return;
  app.addBeforeStartListener(function() {
    var id = app.userModel.generateId(1);
    return app.userModel.findOne({_id: id}).exec().then(function(doc){
      var defaultPasswordHash = app.userModel.generateHash(app.config.defaultAdmin.password);
      if (!doc) {
        log.warn('Creating the default admin, remember to change the password!');
        var theUser = new app.userModel();
        theUser.displayName = "Admin";
        theUser.local.email = app.config.defaultAdmin.email;
        theUser.local.password = defaultPasswordHash;
        theUser.local.verified = true;
        theUser.roles = ['admin'];
        theUser._id = id;
        return theUser.saveP();
      } else {
        if (doc.validPassword('admin'))
          log.warn("The default admin still has the default password!");
      }
    });
  });
},

/*
logger: function or object
{
type: bunyan || simple (default: simple)
options: string || bunyan options
simple recognized name or level
*/
initializeLogging: function() {
  var app = this;
  if (typeof app.config.logger == 'function') {
    app.config.logger(app);
  } else {
    var defaults = {
      name: app.settings.shortname || app.settings.name || app.settings.title || 'base',
      level: 'info'
    };
    var opts = app.config.logger && app.config.logger.options
                ? _.defaults({}, app.config.logger.options, defaults): defaults;
    if (app.config.logger && app.config.logger.type === 'bunyan') {
      var bunyan = require('bunyan');
      app.log.logger = bunyan.createLogger(opts);
    } else {
      app.log.logger = new log.SimpleLogger(opts);
    }
  }
},

useGracefulExiting: function() {
  //see http://blog.argteam.com/coding/hardening-node-js-for-production-part-3-zero-downtime-deployments-with-nginx/
  var app = this;
  app.gracefullyExiting = false;
  app.use(function(req, res, next) {
    if (!app.gracefullyExiting)
      return next();
    res.setHeader ("Connection", "close")
    res.send (502, "Server is in the process of restarting. [stopApp]")
  });
},

configRequestLogging: function() {
  var app = this;
  var config = app.config;
  // default to morgan
  var logtype = 'morgan';
  var options = {};
  var logconfig = config.requests && config.requests.logging;
  if (logconfig) {
    if (typeof logconfig == 'function') {
      logconfig(app);
      logtype = 'none';
    } else if (typeof logconfig == 'string') {
      logtype = logconfig;
    } else {
      logtype = logconfig.type;
      options = logconfig[logtype] || {};
    }
  }

  if (logtype != 'none') {
    log.requestLoggers[logtype](app, options);
  }
}

}; //end app instance methods

/*
usage:
var app = require('obase').createApp(__dirname);
app.get(...); //add routes, etc.
app.start()
*/
function createApp(root, options) {
  root = root || '';
  options = _.defaults(options || {}, {
    views: path.join(root, 'views', path.sep),
    public: path.join(root, 'public'),
    configdir: root,
    configOverrides: {},
    cacheviews: false,
  });
  var app = express();
  app.rootDir = root;
  if (!__theApp) {
    __theApp = app;
  }
  //options.appmethods overrides appmethods
  var methods = _.defaults(options.appmethods || {}, appmethods);
  //the express application object's prototype chain is funky so manually mix-in
  //our application methods
  Object.keys(methods).forEach( function(name) {
    app[name] = methods[name];
  });

  app.log = log; //use simple logger before log configuration

  app._beforeStart = app._setupBeforeStartListeners();
  app.addBeforeStartListener(app._connectToDb.bind(app));
  app._beforeStop = app._setupBeforeStopListeners();
  app.addBeforeStopListener(app._disconnectFromDb.bind(app));

  app.loadConfig = getConfigLoader(options);
  app.userModel = options.userModel;
  var config = app.loadConfig('app');
  app.config = config;
  if (config.settings) {
    Object.keys(config.settings).forEach( function(name) {
      app.set(name, config.settings[name]);
    });
  }
  app.initializeLogging();

  app.email = require('./email')(app);
  require('./passport')(passport, app); // pass passport for configuration
  app.passport = passport;

  app.setupViews(options);

  ///////////////install initial middleware///////////////
  app.useGracefulExiting();

  // adds req.id and req.log
  app.use(log.useReqLog(config.requests && config.requests.hideInternals));

  // configure request logging
  app.configRequestLogging();

  app.use(bodyParser.urlencoded());
  app.use(bodyParser.json());

  app._configureSession();

  app.use(passport.initialize());
  app.use(passport.session()); // persistent login sessions

  app.use(flash()); // use connect-flash for flash messages stored in session

  //now that passport is initialized expose the user to views
  app.use(function(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated())
      res.locals.user = req.user;
    if (req.session.impersonated)
      res.locals.impersonated = true;
    res.locals.query = req.query;
    //automatically expose flash messages to views, do with
    //a function instead of variable because we only want to consume the
    //flash message if the view requests it.
    res.locals.popAlertMessages = _.partial(utils.popAlertMessages, req.flash.bind(req));
    return next();
  });

  // development only
  if ('development' == app.get('env')) {
    // add development vars to res.locals (enables debug_footer)
    app.use(function debugFooterHandler(req, res, next) {
      res.locals.debug = {
        req: req
      };
      next();
    });
  }
  ////////end initial middleware (see start() for more) //////////

  app.setupPrivateMode();
  app.saveCurrentNamedRoute();
  app.setupAccessControlPolicy();
  app.createDefaultAdmin();

  app.set('dburl', config.dburl);
  if (options.public)
    app.set('publicpath', options.public);

  if (process.env.PORT || config.port)
    app.set('port', process.env.PORT || config.port);

  //set up the base app's named routes
  app.updateNamedRoutes(routes(app, passport));
  if (options.routes)
    app.updateNamedRoutes(options.routes);

  return app;
}

//you can use interchangeably with require except if
//or 1) you want a instance of module loaded that is distinct from base's instance
//or 2) you need to load a module using a relative path to your module
function brequire(module) {
  var basepath = process.env.SRC_base ? path.resolve(process.env.SRC_base)
                  : path.join(__dirname, '..');
  if (module.charAt(0) == '.')
    return require(path.join(basepath, module));
  else //by calling require() from this location we ensure base's copy of the module will get priority
    return require(module);
}

function extendModels() {
  //Object.getOwnPropertyNames(baseModels).forEach(function(name) {
  //Object.defineProperty(exports, name, Object.getOwnPropertyDescriptor(baseModels, name));
  //});
  Array.prototype.slice.call(arguments).forEach(_.partial(utils.exportModel, models));
  return models;
}

module.exports = {
  get app() {
    if (!__theApp)
      throw new Error("no app has been created yet");
    return __theApp;
  },
  basedir: path.join(__dirname, '..'),
  createApp: createApp,
  utils: utils,
  models: models,
  routes: routes,
  brequire: brequire,
  extendModels: extendModels,
  getConfigLoader: getConfigLoader
}
