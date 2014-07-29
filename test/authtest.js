var express = require('express')
var mongoose = require('mongoose');
var request = require("supertest-as-promised");

var Promise = require("promise");

var m = require('../models');

describe('Authentication', function() {

  var app;
  var agent1 = null;

  // create a test user for login
  before(function(done) {
    app = require('./fixtures/app')();
    app.start(function(listen) {
      m.User.remove({}
      ,function(){
          theUser = new m.User();
          theUser.displayName = "Test User";
          theUser.local.email = "test@onecommons.org";
          theUser.local.password = "$2a$08$9VbBhF8kBcKIwLCk52O0Guqj60gb1G.hIoWznC806yhsAMb5wctg6"; // test
          //theUser.local.verified = true, //not necessary because test config sets requireEmailVerification = false
          theUser._id = "@User@123";
          theUser.save(function(){
            listen(function(server){
              agent1 = request.agent(app.getUrl());
              done();
            });
          });
        });
    });
  });

  // remove users after test
  after(function(done){
    m.User.remove({}, function(err) {
      app.stop(done);
    });
  });

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
          return new Promise(function(fulfill, reject) {
            setTimeout(function() {
              fulfill();
            }, 1000);
          });
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
})
