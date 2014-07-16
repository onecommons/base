// config/passport.js
var moment = require('moment');
var uuid = require('node-uuid');

// load all the things we need
var LocalStrategy   = require('passport-local').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;

// load up the user model & auth vars
var User            = require('../models/user');
var LoginHistory    = require('../models/loginhistory');

var auth = require('../lib/auth');

// expose this function to our app using module.exports
module.exports = function(passport, app) {
    var config = app.loadConfig('auth');
    passport.email = require('../lib/email')(app);

    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and unserialize users out of session

    // used to serialize the user for the session
    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });

    // used to deserialize the user
    passport.deserializeUser(function(id, done) {
        User.findById(id, function(err, user) {
            done(err, user);
        });
    });

    // =========================================================================
    // LOCAL SIGNUP ============================================================
    // =========================================================================
    // we are using named strategies since we have one for login and one for signup
    // by default, if there was no name, it would just be called 'local'

    passport.use('local-signup', new LocalStrategy({
        // by default, local strategy uses username and password, we will override with email
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true // allows us to pass back the entire request to the callback
    },
    function(req, email, password, done) {

        // asynchronous
        // User.findOne wont fire unless data is sent back
        process.nextTick(function() {

            // find a user whose email is the same as the forms email
            // we are checking to see if the user trying to login already exists
            User.findOne({ 'local.email' :  email }, function(err, user) {
                // if there are any errors, return the error
                if (err)
                    return done(err);

                // check to see if theres already a user with that email
                if (user) {
                    return done(null, false, req.flash('signupMessage', 'That email is already taken.'));
                } else {
                    // if there is no user with that email
                    // create the user
                    var newUser            = new User();

                    // set the user's local credentials
                    newUser.local.email    = email;
                    newUser.local.password = newUser.generateHash(password);

                    // generate a signup token & expiration
                    newUser.local.signupToken = uuid.v4();
                    newUser.local.signupTokenExpires = moment().add(config.confirmationTokenValidFor, 'hours');

                    // save the user
                    newUser.save(function(err) {
                        if (err)
                            throw err;

                        // send the email notification
                        passport.email.sendWelcome(newUser);

                        return done(null, newUser);
                    });
                }

            });

        });

    }));

    // =========================================================================
    // LOCAL LOGIN =============================================================
    // =========================================================================
    // we are using named strategies since we have one for login and one for signup
    // by default, if there was no name, it would just be called 'local'

    passport.use('local-login', new LocalStrategy({
        // by default, local strategy uses username and password, we will override with email
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true // allows us to pass back the entire request to the callback
    },
    function(req, email, password, done) { // callback with email and password from our form

        // find a user whose email is the same as the forms email
        // we are checking to see if the user trying to login already exists
        User.findOne({ 'local.email' :  email }, function(err, user) {
            // if there are any errors, return the error before anything else
            if (err)
                return done(err);

            // if no user is found, return the message
            if (!user)
                return done(null, false, req.flash('loginMessage', 'Oops! Wrong email or password')); // req.flash is the way to set flashdata using connect-flash

            if (!user.local.verified) {
                // XXX should offer a link to re-send verification email!
                auth.recordLogin(user, 'unverified', req.ip);
                return done(null, false, req.flash('loginMessage', 'This account has not been verified. Please check your email'));
            }

            // check for too many failed login attempts
            if (user.local.accountLocked && new Date(user.local.accountLockedUntil) > new Date()) {
                auth.recordLogin(user, 'reject', req.ip);
                return done(null, false, req.flash('loginMessage', 'That account is temporarily locked'));
            }

            // the user is found but the password is wrong
            if (!user.validPassword(password)) {
                var errorMessage = null;

                user.local.failedLoginAttempts += 1;
                // console.log("failed logins:" + user.local.failedLoginAttempts);

                // lock account on too many login attempts (defaults to 5)
                if (user.local.failedLoginAttempts >= config.failedLoginAttempts) {

                  var lockTime = moment().add(config.accountLockedTime, 'seconds');
                  var lockTimeDescription = lockTime.fromNow(true);

                  // console.log("locking account until " + lockTime.toDate());
                  // console.log("account has been locked for " + lockTimeDescription);
                  user.local.accountLocked = true;
                  user.local.accountLockedUntil = lockTime.toDate();

                  errorMessage = 'Invalid user or password. Your account is now locked for ' + lockTimeDescription;
                } else if (user.local.failedLoginAttempts >= config.failedLoginsWarning) {
                  // show a warning after 3 (default setting) failed login attempts
                  errorMessage = 'Invalid user or password. Your account will be locked soon.';
                }

                user.save(function(err) {
                    if (err) {
                        console.log("error saving user");
                        console.log(err);
                        throw err;
                    }

                    // console.log("updating user with failed login counts");
                    var failType = user.local.accountLocked ? 'lock' : 'fail';
                    auth.recordLogin(user, failType, req.ip);
                    return done(null, false, req.flash('loginMessage', errorMessage));
                });
            } else {
                // console.log("successful login");

                //XXX when logging-in we want to change the session cookie's expiration depending on remember me option
                //e.g. req.session.cookie.maxAge = 14 * 24 * 60 * 60 * 1000; //two weeks

                user.local.accountLocked = false;
                user.local.failedLoginAttempts = 0;
                user.local.accountLockedUntil = null;

                auth.recordLogin(user, 'ok', req.ip);

                user.save(function(err) {
                    if (err) {
                        console.log("error saving user");
                        console.log(err);
                        throw err;
                    }

                    // console.log("successful login recorded!");

                    return done(null, user);
                });
            }

        });

    }));


    // =========================================================================
    // FACEBOOK ================================================================
    // =========================================================================
    if (config.facebookAuth) {
      app.updateNamedRoutes({
        fbAuth:           ['auth/facebook', function() {
                                  return passport.authenticate('facebook', {
                                    scope: 'email'
                                  })
                          }],

        fbAuthCallback:   ['auth/facebook/callback', function() {
                                return passport.authenticate('facebook', {
                                  successRedirect: '/profile',
                                  failureRedirect: '/'
                                });
                          }]
      });

      passport.use(new FacebookStrategy({
        // pull in our app id and secret from our auth.js file
        clientID        : config.facebookAuth.clientID,
        clientSecret    : config.facebookAuth.clientSecret,
        callbackURL     : config.facebookAuth.callbackURL
      },

      // facebook will send back the token and profile
      function(token, refreshToken, profile, done) {

        // asynchronous
        process.nextTick(function() {

            // find the user in the database based on their facebook id
            User.findOne({ 'facebook.id' : profile.id }, function(err, user) {

                // if there is an error, stop everything and return that
                // ie an error connecting to the database
                if (err)
                    return done(err);

                // if the user is found, then log them in
                if (user) {
                    return done(null, user); // user found, return that user
                } else {
                    // if there is no user found with that facebook id, create them
                    var newUser            = new User();

                    // set all of the facebook information in our user model
                    newUser.facebook.id    = profile.id; // set the users facebook id
                    newUser.facebook.token = token; // we will save the token that facebook provides to the user
                    newUser.facebook.name  = profile.name.givenName + ' ' + profile.name.familyName; // look at the passport user profile to see how names are returned
                    newUser.facebook.email = profile.emails[0].value; // facebook can return multiple emails so we'll take the first

                    //XXX what if the user already exists -- associate with facebook
                    //XXX facebook.id field should be unique

                    // save our user to the database
                    newUser.save(function(err) {
                        if (err)
                            throw err;

                        // if successful, return the new user
                        return done(null, newUser);
                    });
                }

            });
        });

    }));
  }
};
