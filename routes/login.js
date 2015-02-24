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
  return [
    passport.authenticate('local-login', {
      failureRedirect: '/login',   // back to login on error
      failureFlash: {type:'login.danger'}
    }),
  //replace passport's successReturnToOrRedirect option with one that
  //preserves the http method so that we can return to a redirected POST.
    function(req, res) {
      var url = passport.config.loginRedirect || '/profile';
      var statusCode = 302; //303 is more accurate but express redirect() defaults
      //to 302 so stick to that for consistency
      if (req.session && req.session.returnTo) {
        if (req.session.returnToMethod == req.method) {
          statusCode = 307;
        }
        url = req.session.returnTo;
        delete req.session.returnTo;
      }
      return res.redirect(statusCode, url);
    }
  ]
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
   var redirectUrl = req.session.returnTo
    || req.app.passport.config.verificationRedirect || '/profile';
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
    sentTo: sentTo
  });
}

module.exports.forgotPost = function(app) {
  return function(req, res, next) {
    var sendErr = function(msg) {
      req.flash('danger', msg);
      res.render('forgot.html');
    }

    var address = req.param('email');
    if (!address) {
      return sendErr("Please enter an email address");
    }

    u.User.findOne({"local.email":address}, function(err, user) {
      if (err) {
        return next(err);
      }
      if (!user) {
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
      if (typeof err === 'string') { //user error
        req.flash("danger", err);
        res.render('forgot.html');
      } else {
        next(err); //unexpected error
      }
    } else {
      res.render('reset.html', {token: token});
    }
  });
}

module.exports.forgotTokenPost = function(app) {
  return app.passport.authenticate('local-passwordreset', {
    successRedirect: app.passport.config.passwordResetRedirect || '/profile',
    successFlash: "Your password was reset",
    failureRedirect: '#',
    failureFlash: {type:'danger'}
  });
}

module.exports.changePassword = function(req, res, next) {
  try {
    var p1 = req.param('pass1');
    var p2 = req.param('pass2');
    auth.changePassword(req.user, p1, p2, function(err) {
      var accept = ~(req.headers.accept || '').indexOf('html');
      if (err) {
        if (typeof err === 'string') { //user error
          if (accept) { //form post
            req.flash('danger', err);
            res.render('change-password.html');
          } else {
            res.json({error:err});
          }
        } else {
          return next(err); //unexpected error
        }
      } else {
        if (accept) { //form post
          req.flash('success', "Password Changed");
          res.redirect('/profile');
        } else {
          res.json({success:true});
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports.disableAccount = function(req, res, next) {
  try {
    req.user.disable().then(function() {
      req.flash('warning', 'Your account has been disabled.');
      req.logout();
      res.redirect('/');
    }, next);
  } catch (err) {
    next(err);
  }
}

module.exports.impersonatePost = function(app) {
  return app.passport.authenticate('local-impersonate', {
    successRedirect: app.passport.config.impersonateRedirect || '/profile',
    successFlash: "Impersonation successful. Logout to end impersonation.",
    failureRedirect: '#',
    failureFlash: {type:'danger'}
  });
}
