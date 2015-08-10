var assert = require('assert');
var models = require('../models');
var Promise = require('promise');

describe('signup', function() {
  var app, loginFunc, signupFunc, user;

  before(function(done) {
    app = require('./lib/app')({
      configOverrides: {
        auth: { sendWelcomeEmail: true }
      }
    });

    var signupStrategy = app.passport._strategy('local-signup');
    assert(signupStrategy);
    signupFunc = signupStrategy._verify;
    assert(signupFunc && typeof signupFunc === 'function');

    var loginStrategy = app.passport._strategy('local-login');
    assert(loginStrategy);
    loginFunc = loginStrategy._verify;
    assert(loginFunc && typeof loginFunc === 'function');

    app.start().then(function(){done()}, done);
  });

  // remove users after test
  after(function(done){
    assert(app.get("server"));
    app.addBeforeStopListener(function() {
      return models.Account.remove({}).exec();
    }, true);
    app.stop().then(done,done);
  });

  function mockReq(expected) {
    return {
      flash: function(key, value) {
        if (expected)
          assert.equal(value, expected);
        else
          console.log('flash', key, value)
      },
      //used by local-login strategy:
      session: {
        cookie: {}
      },
      ip: '127.0.0.1'
    }
  }

  it("should create a new account", function(done) {
    new Promise(function(resolve, reject) {
      signupFunc(mockReq(), "Test@Email.com", "passw0rd", function(err, userDoc) {
         assert(!err);
         user = userDoc;
         assert(user && user.local);
         assert.equal(user.local.email, "test@email.com");
         resolve();
      })
    }).then(function() {
      return new Promise(function(resolve, reject) {
        signupFunc(mockReq("That email is already taken."),
            "test@email.com", "passw0rd", function(err, user) {
          assert(!err);
          assert(!user);
          resolve();
        })
      })
    })
    .then(done, done)
  });

  it("should login properly", function(done) {
    new Promise(function(resolve, reject) {
      loginFunc(mockReq(), "Test@Email.com", "passw0rd", function(err, user) {
        assert(!err);
        assert(user);
        resolve();
      })
    })
    .then(function() {
      return new Promise(function(resolve, reject) {
        loginFunc(mockReq('Oops! Wrong email or password'), "test@email.com", "wrong", function(err, user) {
          assert(!err);
          assert(!user);
          resolve();
        })
      })
    })
    .then(done, done);
  });

  it("should disable an account", function(done) {
    user.disable()
    .then(function(updateresponse) { //test that you can't login any more
      assert(updateresponse === 1)
      return new Promise(function(resolve, reject) {
        loginFunc(mockReq('Oops! Wrong email or password'), "test@email.com", "passw0rd", function(err, user) {
          assert(!err);
          assert(!user);
          resolve();
        })
      })
    })
    .then(function() { //test that email address remains reserved
      return new Promise(function(resolve, reject) {
        signupFunc(mockReq("That email is already taken."),
        "test@email.com", "passw0rd", function(err, user) {
          assert(!err);
          assert(!user);
          resolve();
        })
      })
    })
    .then(done, done)
  });

});
