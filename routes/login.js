// login.js  routes for login/logout and authentication.
var auth  = require('../lib/auth.js');
var u  = require('../models/user');
var utils = require('../lib/utils.js');

//
// Login / Logout page
//
module.exports.login = function(app) {
  return function(req, res) {
    // render the page and pass in any flash data if it exists
    res.render('login.html', {
      remembermeEnabled: !!app.config.persistentSessionSeconds
    });
  }
}

module.exports.loginPost = function(passport) {
  return passport.authenticate('local-login', {
    successReturnToOrRedirect: passport.config.loginRedirect || '/profile',
    failureRedirect: '/login',   // back to login on error
    failureFlash: {type:'login.danger'}
  });
}

module.exports.logout = function(req, res) {
  req.logout();
  res.redirect('/');
}

module.exports.signupPost = function(passport) {
  return passport.authenticate('local-signup', {
    successRedirect: passport.config.signupCompleteRedirect || '/profile',
    failureRedirect: '/signup',  // back to signup on error
    failureFlash: {type:'signup.danger'}
  });
}

/*
verification link in email
*/
module.exports.verificationToken = function(req, res, next) {
  var token = req.params.token;
  auth.checkVerificationToken(token, function(err, user) {
    if (err) {
      if (typeof err === 'string') {
        req.flash('danger', err);//user error
      } else {
        return next(err); //unexpected error
      }
   } else {
     req.flash('success', "Thank you, your email has been verified.")
   }
   var redirectUrl = req.session.returnTo || '/profile';
   delete req.session.returnTo;
   return res.redirect(redirectUrl);
  });
}

module.exports.resendVerification = function(req, res, next) {
  try {
    if (req.user && req.user.local.email && req.user.local.signupToken) {
      req.app.email.resendVerification(req.user);
      var accept = req.headers.accept || '';
      if (~accept.indexOf('html')) { //form post
        res.render('verification-sent.html', {
          email: req.user.local.email,
        });
      } else {
        res.json({success:true, sentTo: req.user.local.email});
      }
    } else {
      next(new Error('can not resend verification email, invalid user'));
    }
  } catch (err) {
    next(err);
  }
}

// if 'forgotEmail' flash is set, an email was sent so show that page
// otherwise just show the forgot page with the form
module.exports.forgot = function(req, res) {
  var tmp = req.flash('forgotEmail'); // returns empty array if unset
  var sentTo = tmp.length > 0 ? tmp[0] : null;

  res.render('forgot.html', {
    message: req.flash('message'),
    sentTo: sentTo
  });
}

module.exports.forgotPost = function(app) {
  return function(req, res, next) {
    var sendErr = function(msg) {
      res.render('forgot.html', { message:msg });
    }

    var address = req.param('email');
    if (!address) {
      return sendErr("Please enter an email address");
    }

    u.User.findOne({"local.email":address}, function(err, user) {
      // XXX be careful what we reveal here! possible security issues
      if (err || !user) {
        return sendErr("Can't find a user with that email address");
      }

      // generate a password reset token & expiration
      auth.createResetToken(user, function(err, resetToken) {
        if (err) {
          return next(err);
        } else {
          app.email.sendForgot(user);
          req.flash('forgotEmail', address);
        }

        res.redirect('/forgot');
      });
    });
  };
}

module.exports.forgotToken = function(req, res) {
  var token = req.params.token;

  auth.userForResetToken(token, function(err, user) {
    if (err) {
      res.render('forgot.html', { message:err });
    } else {
      console.log("got user:"+ user);
      res.render('reset.html');
    }
  });
}

module.exports.forgotTokenPost = function(req, res) {
  console.log("forgotTokenPost");

  var token = req.params.token;
  console.log("got forgotTokenPost:" + token);
  var p1 = req.param('pass1');
  var p2 = req.param('pass2');

  auth.resetPasswordWithToken(token, p1, p2, function(err, user) {
    if (err) {
      res.render('reset.html', {message:err})
    } else {
      req.flash("info", "Password reset");
      // XXX where to redirect after reset? login again with new pw?
      res.redirect('/profile');
    }

  });
}
