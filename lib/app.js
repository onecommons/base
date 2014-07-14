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
var errorhandler = require('errorhandler');
var path  = require('path');
var assert = require('assert');

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

updateNamedRoutes: function(routes) {
  var namedRoutes = this.get("namedRoutes") || new NamedRoutes();
  namedRoutes.updateRoutes(this, routes);
  var routes = namedRoutes.getUrlMap();
  this.set("namedRouteUrls", routes);
  this.set("namedRoutes", namedRoutes);
},

stop: function(closeCallback, forcequit) {
  var onclose = function() {
    mongoose.connection.close(closeCallback);
  };
  this.gracefullyExiting = true;
  var server = this.get("server");
  if (server)
    server.close(onclose)
  else
    onclose();

  if (forcequit) {
    var timeout = typeof forcequit == "number" ? forcequit : STOP_APP_TIMEOUT;
    setTimeout( function () {
      console.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, timeout);
  }
},

/*
@param ready function called
if ready is defined it is the responsibility of that function to start listening (if desired) by calling the supplied listen function.
e.g.:
function ready(listen) {
   //do more stuff
   //if you want to initiate listening:
   listen(function(server) { //optional listen callback
   })
}
if ready is not defined, the server will start listening
@param closeCallback invoked when app is terminated, see app.stop()
*/
start: function(ready, closeCallback) {
  var app = this;
  app.get("namedRoutes").applyRoutes();

  //app.startstack = new Error().stack;
  //set up clean shutdown on sigterm
  //see http://blog.argteam.com/coding/hardening-node-js-for-production-part-3-zero-downtime-deployments-with-nginx/
  //and https://github.com/visionmedia/express/issues/1366
  process.on( 'SIGTERM', function() {app.stop(closeCallback,true);});
  //XXX what about SIGINT (ctrl-c)? closeCallback needs to call process.exit(1) in that case
  var onready = function() {
    if (ready) {
       ready(function(onlisten) {
         var server = app.listen(app.get('port'), 'localhost', function() {
           console.log('Express server listening on port %d', server.address().port);
           if (onlisten) onlisten(server);
         });
         app.set('server', server);
       });
    } else {
      var server = app.listen(app.get('port'), 'localhost', function() {
        console.log('Express server listening on port %d',server.address().port);
      });
      app.set('server', server);
    }
  };

  var dburl  = app.get("dburl");
  mongoose.connect(dburl, function(err) {
    if (err)
      throw err;
    else
      console.log("connecting to database", dburl);

    // optionally apply data migrations in /updates folder before starting server.
    if(app.set('autoUpdates')) {
      console.log("checking for autoupdates to apply...");
      require('keystone').connect(mongoose); // need to do this for updates to work.
      var updates = require('keystone/lib/updates');
      updates.apply(function(){
        onready()
      });
    } else  {
      onready();
    }
  });
},

getUrl: function() {
  var server = this.get("server");
  if (!server)
    return null;
  var address = server.address();
  //XXX support https
  return util.format("http://%s:%d", address.address, address.port);
}

};

/*
usage:

app = base.createApp(__dirname);
app.get(...); //add routes, etc.
app.start()
*/
function createApp(root, options) {
  root = root || '';
  options = _.defaults(options || {}, {
    views: path.join(root, 'views', path.sep),
    public: path.join(root, 'public'),
    configdir: root,
    cacheviews: false
  });
  var app = express();
  app.loadConfig = configloader(path.resolve(options.configdir), path.join(__dirname, '..'));
  var config = app.loadConfig('app');
  require('../config/passport')(passport, app); // pass passport for configuration

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
  var cookiesecret = config.cookie_secret;
  if (!cookiesecret) {
    cookiesecret = crypto.randomBytes(64).toString('base64');
    console.log('no cookie_secret set in config/app.js, randomly choosing', cookiesecret);
  }
  app.use(cookieParser(cookiesecret));
  app.use(session(config.sessionfactory ? config.sessionfactory() : {}));
  app.use(passport.initialize());
  app.use(passport.session()); // persistent login sessions
  app.use(flash()); // use connect-flash for flash messages stored in session

  // development only (needs to appear before static)
  if ('development' == app.get('env')) {
    // add development vars to res.locals (enables debug_footer)
    app.use(function debugFooterHandler(req, res, next) {
      res.locals.debug = true;
      res.locals.req = req;
      next();
    });
  }

  var staticpath = path.join(__dirname, '..', 'public');
  app.use(require('less-middleware')(staticpath,{
    //debug: true,
  }));
  app.use(express.static(staticpath));
  //XXX bad: this will happen before routes are added
  //do deferred processing:
  if (options.public) {
    app.use(express.static(options.public));
  }

  if ('development' == app.get('env')) {
    app.use(errorhandler()); //development only, should appear as last use()?
  }

  // app.use(require('express-domain-middleware')); // to better handle errors without crashing node
  // error handler
  // app.use(function(err,req,res,next){
  //   console.error("An error occurred:", err.message);
  //   console.error("err.stack: ", err.stack);
  //   res.send(500);
  // });

  app.set('dburl', config.dburl);
  if (process.env.PORT || config.port)
    app.set('port', process.env.PORT || config.port);
  // using keystone's update.js, a data migration system: see
  //  http://keystonejs.com/docs/configuration/#updates
  app.set('autoUpdates', config.autoUpdates);
  Object.keys(appmethods).forEach( function(name) {
    app[name] = appmethods[name];
  });
  //set up the base app's named routes
  app.updateNamedRoutes(routes(app, passport));

  return app;
}

module.exports = {
  basedir: path.join(__dirname, '..'),
  createApp: createApp,
  utils: utils,
  models: models,
  routes: routes,
}
