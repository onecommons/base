// login.js  routes for login/logout and authentication.
var auth  = require('../lib/auth.js');
var User  = require('../models/user');
var utils = require('../lib/utils.js');

//
// Login / Logout page
//
module.exports.login = function(req, res) {
  // render the page and pass in any flash data if it exists
  res.render('login.html', { message: req.flash('loginMessage') });
}

module.exports.loginPost = function(passport) {
  return passport.authenticate('local-login', {
    successReturnToOrRedirect: '/profile',
    failureRedirect: '/login',   // back to login on error
    failureFlash: true
  });
}

module.exports.logout = function(req, res) {
  req.logout();
  res.redirect('/');
}

//
// Signup page
//
module.exports.signup = function(req, res) {
  // render the page and pass in any flash data if it exists
  res.render('signup.html', { message: req.flash('signupMessage') });
}

module.exports.signupPost = function(passport) {
  return passport.authenticate('local-signup', {
    successRedirect: '/verification', // verification notification page
    failureRedirect: '/signup',  // back to signup on error
    failureFlash: true
  });
}

module.exports.verification = function(req, res) {
  var address;
  var tmp = req.flash('verificationEmail'); // returns empty array if unset
  if (tmp.length > 0) {
    address = tmp[0];
  } else if (utils.isDefined(req, 'user.local.email')) {
    address = req.user.local.email;
  }

  if (address) {
    res.render('verification-sent.html', {
      email: address,
      resendLink: '/verification-resend'
    });
  } else {
    res.redirect('/verification-resend');
  }
}

module.exports.verificationPost = function(req, res) {
  var token = req.params.token;
  auth.checkVerificationToken(token, function(err, user) {
    if (err) {
      // redirect to verification required with error message?
      // we don't have a token so you'll have to sign up again or
      // re-enter your email address to have the token re-sent?
      console.log("error verifying token");
      console.log(err);
      return res.redirect("/signup");
    } else {
      // XXX configure which page the user is redirected to
      console.log("verified user:" + user);
      // XXX put in a message saying you have been verified?
      return res.redirect("/profile");
    }
  });
}

module.exports.resendVerification = function(req, res) {
  res.render('verification-resend.html');
}

module.exports.resendVerificationPost = function(passport) {
  return function(req, res) {
    var sendErr = function(msg) {
      res.render('verification-resend.html', {
        message:msg
      });
    }

    var address = req.param('email');
    if (!address) {
      return sendErr("Please enter an email address");
    }

    User.findOne({"local.email":address}, function(err, user) {
      if (err) {
        console.log("error looking up user with address:" + address);
        console.log(err);
        return sendErr("Can't find a user with that email address");
      }

      if (!user) {
        console.log("can't find a user with address:" + address);
        return sendErr("Can't find a user with that email address");
      }

      // XXX what to do if the user is already verified?

      passport.email.resendVerification(user);
      req.flash('verificationEmail', address);
      res.redirect('/verification');
    });
  };
}

module.exports.profile = function(req, res) {
  res.render('profile.html', {
    user : req.user
  });
}

//
// Facebook login handlers
//
module.exports.facebookAuth = function(passport) {
  return passport.authenticate('facebook', {
    scope: 'email'
  });
}

module.exports.facebookAuthCallback = function(passport) {
  passport.authenticate('facebook', {
    successRedirect: '/profile',
    failureRedirect: '/'
  });
}
