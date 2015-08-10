var main = require('../../index'),
 express = require('express'),
 mongoose = require('mongoose');
var _ = require('underscore');
var createModel = require('../../lib/createmodel');

// create some  models we will need for testing.

createModel('DbTest1',
  new mongoose.Schema({
    __t: String,
     _id: String,
    prop1: []
  },{strict: false}), //'throw'
  null, {'any': 'user'}
);

function addBrowserTests() {
  this.addTestUser();
  var LocalStrategy = require('passport-local').Strategy;
  this.passport.use('testauto-login', new LocalStrategy({
      passReqToCallback : true // allows us to pass back the entire request to the callback
  }, function(req, email, password, done) { // callback with email and password from our form
    main.models.User.findOne({_id:"@User@123"}, function(err, doc){
      done(err, doc);
    });
  }));

  this.get('/browsertest/:testname',
  function(req, res, next) {
    //need to set these for the passport strategy to work
    req.query = {username:'dummy', password:'dummy'}
    next();
  }, this.passport.authenticate('testauto-login'),
    function(req, res) {
      res.render('browsertest.html', {
          testName: req.params.testname
      })
  });
}

function addUserStartupListener() {
  return main.models.User.remove({_id: "@User@123"}).exec()
    .then(function(){
      var theUser = new main.models.User();
      theUser.displayName = "Test User";
      theUser.local.email = "test@onecommons.org";
      theUser.local.password = "$2a$08$9VbBhF8kBcKIwLCk52O0Guqj60gb1G.hIoWznC806yhsAMb5wctg6"; // test
      theUser.local.verified = true, //not necessary because test config sets requireEmailVerification = false
      theUser._id = "@User@123";
      return theUser.saveP();
    });
}

function createApp(options) {
  app = main.createApp(__dirname, _.defaults(options || {}, {
    views: __dirname + '/../views',
    public: __dirname + '/../public'
  }));
  app.get('/testerrorpage', function(req, res, next) { next(new Error('test error')); });
  //console.log('test public dir', main.dirname + '/test/public');
  //app.use(express.static(main.dirname + '/test/public'));
  app.addTestUser = function() {
    app.addBeforeStartListener(addUserStartupListener);
    app.addBeforeStopListener(function() {
      return main.models.User.remove({_id: "@User@123"}).exec();
    }, true);
  }
  app.addBrowserTests = addBrowserTests;
  return app;
}
module.exports = createApp;

/* XXX
function() {
  var mocha = require('mocha');
  mocha.before(function(done) {app.start(
    function(listen){listen(); done();};
  });
  mocha.after(function(done) {app.stop(done)});
}
*/

// check to see if we're the main module (i.e. run directly, not require()'d)
if (require.main === module) {
  var app = createApp();
  app.addBrowserTests();
  app.start(function(next) {
    mongoose.connection.db.dropCollection('dbtest1', next);
  });
}
