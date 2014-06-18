// login.js  routes for login/logout and authentication.

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
    successRedirect: '/profile', // secure profile section
    failureRedirect: '/signup',  // back to signup on error
    failureFlash: true
  });
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
