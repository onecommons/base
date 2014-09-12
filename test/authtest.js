var express = require('express')
var mongoose = require('mongoose');
var request = require("supertest-as-promised");
var assert = require('chai').assert;
var Promise = require("promise");
require("should")

var m = require('../models');

function delay(timeout, res) {
  return new Promise(function(fulfill, reject) {
    setTimeout(function() {
      fulfill(res);
    }, timeout);
  });
}

function extractCookie(cookie) {
  return cookie.match(/(.+?);/)[1]
}

function setupApp(cb, options) {
  var app = require('./fixtures/app')(options);
  app.start(function(next) {
    m.User.remove({}
    ,function(){
        theUser = new m.User();
        theUser.displayName = "Test User";
        theUser.local.email = "test@onecommons.org";
        theUser.local.password = "$2a$08$9VbBhF8kBcKIwLCk52O0Guqj60gb1G.hIoWznC806yhsAMb5wctg6"; // test
        //theUser.local.verified = true, //not necessary because test config sets requireEmailVerification = false
        theUser._id = "@User@123";
        theUser.save(next);
      });
  }, function(server){
      cb(app, request.agent(app.getUrl()));
  });
}

function stopApp(app, done) {
  m.User.remove({}, function(err) {
    app.stop(done);
  });
}
describe('Authentication', function() {

  var app;
  var agent1 = null;

  // create a test user for login
  before(function(done) {
    setupApp(function(_app, _agent) {
      app = _app;
      agent1 = _agent;
      done();
    });
  });

  // remove users after test
  after(function(done) { stopApp(app, done); });

  describe('local login', function(){
    it('should fail a nonexistent username', function(done) {
      request(app.getUrl())
      .post('/login')
      .type('form')
      .redirects(0)
      .send({email:"asdfasdfa@onecommons.org", password:"badpassword"})
      .expect(302)
      .expect('Location', '/login')
      .end(done)
    });

    it('should fail an incorrect password', function(done) {
      request(app.getUrl())
      .post('/login')
      .type('form')
      .redirects(0)
      .send({email:"test@onecommons.org", password:"badpassword"})
      .expect(302)
      .expect('Location', '/login')
      .end(done)
    });

    it('should accept a correct username & password', function(done) {
      request(app.getUrl())
      .post('/login')
      .type('form')
      .redirects(0)
      .send({email:"test@onecommons.org", password:"test"})
      .expect(302)
      .expect('Location', '/profile')
      .end(done)
    });

    it('should lock an account after 5 failed logins', function(done) {

      function makeIncorrectLogin() {
        return agent1.post('/login')
          .type('form')
          .redirects(0)
          .send({
            email: "test@onecommons.org",
            password: "badpassword"
          })
          .expect(302)
          .expect('Location', '/login')
      }

      // XXX could add check for warning
      // "Your account will be locked soon"
      // make four failed attempts
      makeIncorrectLogin()
        .then(makeIncorrectLogin)
        .then(makeIncorrectLogin)
        .then(makeIncorrectLogin)
        // fifth attempt will lock the account
        .then(function(res) {
          return agent1.post('/login')
                      .type('form')
                      .redirects(2)
                      .send({
                        email: "test@onecommons.org",
                        password: "badpassword"
                      })
                      .expect(200)
                      .expect(/Your account is now locked/);
        })
        // subsequent logins with the correct password will fail
        .then(function(res) {
          return agent1.post('/login')
                  .type('form')
                  .redirects(2)
                  .send({
                    email: "test@onecommons.org",
                    password: "test"
                  })
                  .expect(/That account is temporarily locked/);
        })
        // wait for the 1-second lockout period to expire
        .then(function(res) {
          return delay(1000);
        })
        // next login attempt with correct password should pass
        .then(function(res) {
          return agent1.post('/login')
                  .type('form')
                  .redirects(0)
                  .send({
                    email: "test@onecommons.org",
                    password: "test"
                  })
                  .expect(302)
                  .expect('Location', '/profile');
        })
        .then(function(res) {
          done();
        })
    });

  });

  describe('sessions', function() {
    // agent stores cookies for multiple requests
    var agent;

    // recreate the user before these tests
    before(function(done) {
      agent = request.agent(app);
      m.User.remove({}
      ,function(){
          theUser = new m.User();
          theUser.displayName = "Test User";
          theUser.local.email = "test@onecommons.org";
          theUser.local.password = "$2a$08$9VbBhF8kBcKIwLCk52O0Guqj60gb1G.hIoWznC806yhsAMb5wctg6"; // test
          //theUser.local.verified = true, //not necessary because test config sets requireEmailVerification = false
          theUser._id = "@User@123";
          theUser.save(function(){
            done();
          });
        });
    });


    it('should create a new session', function(done) {
      agent.get('/')
           .expect('set-cookie', /.+/)
           .expect(/html/)
           .expect(200, done);
    });

    it('should allow access to restricted pages after login', function(done) {
      agent
      .post('/login')
      .type('form')
      .redirects(0)
      .send({email:"test@onecommons.org", password:"test"})
      .expect(302)
      .expect('Location', '/profile')
      .then(function() {
        return agent.get('/profile')
                    .redirects(0)
                    .expect(200)
                    .expect(/html/)
                    .then(function() {
                      done();
                    });
      });
    });

    it('should allow access to recent login restricted pages after login', function(done) {
       agent.get('/profile/transactions')
                    .redirects(0)
                    .expect(/html/)
                    .expect(200, done);
    });

    it('should not allow access to recent login restricted pages after timeout', function(done) {
      setTimeout(function() {
       agent.get('/profile/transactions')
             .expect(302)
             .expect('Location', '/login')
             .end(done);
      }, 300);
    });
  })
});

describe('Session timeouts', function() {
  var app;
  var agent1 = null;

  var appConfig = {
    configOverrides: {
      app: {
        //note: can't be shorter because cookie expires have 1 sec resolution
        persistentSessionSeconds: 2,
        browsersessionSessionSeconds: .2,
        //port: 4000
      }
    },
    routes: {
      setSessionValue: function(req,res) { req.session.test = "set";
      //console.dir(req.session); console.log('rc', req.cookies);
        res.status(200).send("ok");
      },
      getSessionValue: function(req, res)  {//console.dir(req.session); console.log('rc', req.cookies);
        res.status(200).send(String(req.session.test));
      }
    }
  };

  // create a test user for login
  before(function(done) {
    setupApp(function(_app, _agent) {
      app = _app;
      done();
    }, appConfig);
  });

// remove users after test
  after(function(done) { stopApp(app, done); });

  this.timeout(3000);

  it('temporary sessions should timeout after timeout', function(done) {
    var agent1 = request.agent(app.getUrl());
    var sessioncookie = null;
    agent1.get('/setSessionValue').expect('set-cookie', /connect\.sid/).expect('ok').expect(200)
    .then(function(res) {
      sessioncookie = res.headers['set-cookie'][0];
      return agent1.get('/getSessionValue').expect('set');
    }).then(function(res) {
      if (res.headers['set-cookie'])
        assert(sessioncookie == res.headers['set-cookie'][0], "session id should not have changed");
      return delay(300,res);
    }).then(function(res){ //session should have timed out by now
      return agent1.get('/getSessionValue').expect('set-cookie', /connect\.sid/).expect('undefined').expect(200);
    }).then(function(res) {
      assert(sessioncookie != res.headers['set-cookie'][0], "session id should have changed");
      done();
    });
  });

  it("login with rememberme", function(done) {
    var sessioncookie = null;
    var agent1 = request.agent(app.getUrl());
    agent1.post('/login')
    .type('form')
    .redirects(0)
    .send({email:"test@onecommons.org", password:"test", rememberme: 'on'})
    .expect('set-cookie', /connect\.sid.+Expires=/)
    .expect(302)
    .expect('Location', '/profile')
    .then(function(res) {
      sessioncookie = res.headers['set-cookie'][0];
      return agent1.get('/setSessionValue').expect('ok');
    }).then(function (res) {
      //console.log(res.headers['set-cookie'][0], new Date());
      //session id should not have changed
      if (res.headers['set-cookie'])
        extractCookie(sessioncookie).should.equal(extractCookie(res.headers['set-cookie'][0]));
      return delay(300, res);
    }).then(function(res) { //should not have timed out by now
        return agent1.get('/getSessionValue').expect('set').expect(200);
    }).then(function(res) {
      //session id should not have changed
      if (res.headers['set-cookie'])
        extractCookie(sessioncookie).should.equal(extractCookie(res.headers['set-cookie'][0]));
      return delay(2050, res); //wait for the persistent session to have expired
   }).then(function(res){
      //create a new request to ensure the same session cookie is sent despite the expire time
      var cookie = extractCookie(sessioncookie);
      request(app.getUrl()).get('/getSessionValue').set('Cookie', cookie).expect('undefined')
        .expect(200).expect('set-cookie', /connect\.sid/).end(function(err, res) {
          //session id should have changed (and cookie won't have Expires)
          if (err) throw err;
          cookie.should.not.equal(extractCookie(res.headers['set-cookie'][0]));
          done();
        });
    });
 });

  //login in with rememberme login then again without it, the session cookie shouldn't have expires
it("login without rememberme should remove persistent cookie", function(done) {
  var agent1 = request.agent(app.getUrl());
  agent1.post('/login')
  .type('form')
  .redirects(0)
  .send({email:"test@onecommons.org", password:"test", rememberme: 'on'})
  .expect('set-cookie', /connect\.sid.+Expires=/)
  .expect(302)
  .expect('Location', '/profile')
  .then(function(res) {
    return agent1.post('/login')
    .type('form')
    .redirects(0)
    .send({email:"test@onecommons.org", password:"test"})
    .expect('set-cookie', /connect\.sid/)
    .expect(function(res){
      if (res.headers['set-cookie'][0].match(/connect\.sid.+Expires=/))
        return "session cookie should not have Expires";
    }).expect(302)
    .expect('Location', '/profile');
  }).then(function(res){
    return agent1.get('/setSessionValue').expect('ok');
  }).then(function (res) {
    return delay(300, res);
  }).then(function(res) { //should have timed out by now
      return agent1.get('/getSessionValue')
      .expect('set-cookie', /connect\.sid/).expect('undefined').expect(200);
  }).then(function(){done()});
});

});
