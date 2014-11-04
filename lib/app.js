/**
 * Module dependencies.
 */
var express = require('express');
var View = require('express/lib/view');
var routes = require('../routes');
var path = require('path');
var swig = require('swig');
var mongoose = require('mongoose');
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
var morgan = require('morgan'); //formerly known as express.logger()
var errorhandler = require('./errorhandler');
var path  = require('path');
var assert = require('assert');
var createModel = require('./createmodel');
var access = require('./access');

var __theApp = null;

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
  options.df = require("./dataForm").dataform();
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
    app.use(express.static(publicpath));
    app.use(require('less-middleware')(publicpath,{
      //debug: true,
    }));
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
    console.log('no cookie_secret set in config/app.js, randomly choosing', cookiesecret);
  }
  app.use(cookieParser(cookiesecret));
  var sessionconfig = {
    secret: cookiesecret,
  //the rolling feature doesn't impact how long session live on the server-side
  //but it does update the expire time on the session cookie
  //and as a side effect forces the session cookie to be set every request
  //without this the cookie for existing sessions will not be sent if it doesn't have an expires
  //but we need it to be in the case where we downgrade a persistent session to browser-session one
  //when the user logs in again without "rememberme" checked
  //(search for "debug('already set browser-session cookie');" in express-session)
    rolling: !!config.persistentSessionSeconds
  };
  if (config.sessionfactory) {
    config.sessionfactory(sessionconfig, app, session);
  } else {
    var MongoStore = require('connect-mongo')(session);
    sessionconfig.store = new MongoStore({
          url: config.dburl,
          //the session ttl if session.cookie.expires isn't set:
          defaultExpirationTime: config.browsersessionSessionSeconds * 1000
    });
  }
  //the session middleware works as follows:
  //if no req.session is set read sessionid out of session cookie and load the session
  //if session cookie isn't present generates a new session
  //at the end of the request the session is stored if modified and set-cookie header is sent
  app.use(session(sessionconfig));
},

_setupBeforeStartListeners: function() {
  var app = this;
  var callbacks = [];
  var listen;

  function next() {
    if (callbacks.length) {
       callbacks.shift()(next);
    } else if (listen){
      var server = app.listen(app.get('port'), 'localhost', function() {
        console.log('Express server listening on port %d',server.address().port);
        if (typeof listen == 'function') {
          listen(server);
        }
      });
      app.set('server', server);
    }
  }

  /*
  Adds an listener that is invoked when the app is about to start.

  @param callback The callback takes one argument that is function that must be called
  to invoke the next event listener or start the app.
  */
  app.addBeforeStartListener = function(callback) {
    callbacks.push(callback);
  }
  return function(_listen) {
    listen = _listen;
    next();
  };
},

_connectToDb: function(next) {
  var dburl  = this.get("dburl");
  mongoose.connect(dburl, function(err) {
    if (err)
      throw err;
    else
      console.log("connecting to database", dburl);

    if (next) next();
  });
},

_disconnectFromDb: function(next) {
  mongoose.connection.close(next);
},

/*
@param ready (optional) Equivalent of calling app.addBeforeStartListener(ready)
@param listen If boolean specifies whether or not the app starts listening.
  If a function, a callback that is invoke when the app starts listening.
  If omitted, defaults to true
*/
start: function(ready, listen) {
  listen = typeof listen === 'undefined' ? true : listen; //default to true
  var app = this;
  if (!app.userModel) //delay creation of the user model till now
    app.userModel = models.User;

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

  //app.startstack = new Error().stack;
  //set up clean shutdown on sigterm
  //see http://blog.argteam.com/coding/hardening-node-js-for-production-part-3-zero-downtime-deployments-with-nginx/
  //and https://github.com/visionmedia/express/issues/1366
  process.on( 'SIGTERM', function() {app.stop(null,true);});
  //XXX what about SIGINT (ctrl-c)? closeCallback needs to call process.exit(1) in that case
  if (ready)
    app.addBeforeStartListener(ready);
  app._beforeStart(listen);
},

_setupBeforeStopListeners: function() {
  var app = this;
  var callbacks = [];

  function next() {
    if (callbacks.length) {
       var cb = callbacks.shift();
       //this no argument affordance primarily for mocha's "done"
       callbacks.length ? cb(next) : cb();
    }
  }

  /*
  Adds an listener that is invoked when the app is about to stop.

  @param callback The callback takes one argument that is function that must be called
  to invoke the next event listener or stop the app.
  */
  app.addBeforeStopListener = function(callback, first) {
    if (first)
      callbacks.unshift(callback);
    else
      callbacks.push(callback);
  }
  return next;
},

/*
@param closeCallback invoked when app is terminated
*/
stop: function(closeCallback, forcequit, keepglobal) {
  if (!keepglobal && this === __theApp)
    __theApp = null;
  if (closeCallback)
    this.addBeforeStopListener(closeCallback);

  this.gracefullyExiting = true;
  var server = this.get("server");
  if (server)
    server.close(this._beforeStop)
  else
    this._beforeStop();

  if (forcequit) {
    var timeout = typeof forcequit == "number" ? forcequit : STOP_APP_TIMEOUT;
    setTimeout( function () {
      console.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, timeout);
  }
},

getUrl: function() {
  var server = this.get("server");
  if (!server)
    return null;
  var address = server.address();
  //XXX support https
  return util.format("http://%s:%d", address.address, address.port);
},

updateNamedRoutes: function(routes) {
  var namedRoutes = this.get("namedRoutes") || new NamedRoutes();
  namedRoutes.updateRoutes(this, routes);
  var routes = namedRoutes.getUrlMap();
  this.set("namedRouteUrls", routes);
  this.set("namedRoutes", namedRoutes);
},

setupPrivateMode: function(){
  var app = this;
  if (!app.config.privatemode || app.config.privatemode.disable)
    return false;

  function guard(req, res, next) {
    if (req.user || req.path.match(app.config.privatemode.whitelist || /(login)|(auth)/)) {
      next();
    }else {
      req.session.returnTo = req.url;
      res.redirect(app.config.privatemode.redirect || '/login');
    }
  }

  var methods = ['get']; //,'post','put','head','delete','options'];
  app.addListener('namedroutes-install-hook', function(routehooks) {
    routehooks.push(
      function(route) {
        var copy = {};
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
   //roles: [{type:String, default: 'user'}]
   roles: {type:Array, default: ['user']}
  });
  var policy = createModel.getAccessControlPolicy();
  this.accessControl = access.createPermissionsChecker(policy);
},

createDefaultAdmin: function() {
  var app = this;
  if (!app.config.defaultAdmin)
    return;
  app.addBeforeStartListener(function(next) {
    var id = app.userModel.generateId(1);
    app.userModel.findOne({_id: id},
     function(err, doc){
      var defaultPasswordHash = app.userModel.generateHash(app.config.defaultAdmin.password);
      if (!doc) {
        console.log('WARNING: creating the default admin, remember to change the password!');
        theUser = new app.userModel();
        theUser.displayName = "Admin";
        theUser.local.email = app.config.defaultAdmin.email;
        theUser.local.password = defaultPasswordHash;
        theUser.local.verified = true;
        theUser.roles = ['admin'];
        theUser._id = id;
        theUser.save(next);
      } else {
        if (doc.validPassword('admin'))
          console.log("WARNING: default admin still has the default password!");
        if (next) next();
      }
    });
  });
},

}; //end app instance methods

/*
usage:
var app = require('base').createApp(__dirname);
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
  var methods = _.defaults(options.appmethods || {}, appmethods);
  Object.keys(methods).forEach( function(name) {
    app[name] = methods[name];
  });

  app._beforeStart = app._setupBeforeStartListeners();
  app.addBeforeStartListener(app._connectToDb.bind(app));
  app._beforeStop = app._setupBeforeStopListeners();
  app.addBeforeStopListener(app._disconnectFromDb.bind(app));

  app.loadConfig = configloader(options.configOverrides,
    path.resolve(options.configdir), path.join(__dirname, '..'));
  app.userModel = options.userModel;
  var config = app.loadConfig('app');
  app.config = config;
  app.email = require('./email')(app);
  require('./passport')(passport, app); // pass passport for configuration
  app.passport = passport;

  //create a custom view class bound to this app instance
  var appViewCtor = function(name, options) {
    AppView.call(this, name, options);
    this.app = app;
  }
  util.inherits(appViewCtor, AppView);
  app.set('view', appViewCtor);

  //use '..' cause we're in lib
  var baseviewpath = path.normalize(path.join(__dirname, '..', 'views', path.sep));
  var viewpath = options.views ?
      [path.normalize(path.join(options.views,path.sep)), baseviewpath]
      : [baseviewpath];
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

  //see http://blog.argteam.com/coding/hardening-node-js-for-production-part-3-zero-downtime-deployments-with-nginx/
  app.gracefullyExiting = false;
  app.use(function(req, res, next) {
    req.app = res.app = app;
    if (!app.gracefullyExiting)
      return next();
    res.setHeader ("Connection", "close")
    res.send (502, "Server is in the process of restarting. [stopApp]")
  });

  if (typeof config.request_logger == 'undefined') {
    //use it twice in order to log both initial request and response
    app.use(morgan({format: 'dev', immediate: true }));
    app.use(morgan({format: 'dev'}));
  } else if (typeof config.request_logger == 'function') {
    config.request_logger(app);
  } //else no request logging

  app.use(bodyParser.urlencoded());
  app.use(bodyParser.json());
  app._configureSession();
  app.use(passport.initialize());
  app.use(passport.session()); // persistent login sessions
  app.use(flash()); // use connect-flash for flash messages stored in session

  // development only
  if ('development' == app.get('env')) {
    // add development vars to res.locals (enables debug_footer)
    app.use(function debugFooterHandler(req, res, next) {
      res.locals.debug = true;
      res.locals.req = req;
      next();
    });
  }

  app.setupPrivateMode();
  app.setupAccessControlPolicy();
  app.createDefaultAdmin();

  // app.use(require('express-domain-middleware')); // to better handle errors without crashing node
  // error handler
  // app.use(function(err,req,res,next){
  //   console.error("An error occurred:", err.message);
  //   console.error("err.stack: ", err.stack);
  //   res.send(500);
  // });

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
  extendModels: extendModels
}
