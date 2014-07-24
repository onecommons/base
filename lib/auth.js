var moment = require('moment');
var uuid   = require('node-uuid');

var User         = require('../models/user');
var LoginHistory = require('../models/loginhistory');

module.exports.recordLogin = function(user, status, ipAddress) {
    var hist = new LoginHistory();
    hist.user = user;
    hist.ip = ipAddress;
    hist.status = status;

    hist.save(function(err) {
        if (err) {
            console.log("Error saving login history!");
            console.log(err);
        }
    });
}

module.exports.checkVerificationToken = function(token, callback) {

  User.findOne({"local.signupToken":token}, function(err, user) {
    if (err) {
      callback("error looking up user with token:" + token, null);
      return;
    }

    if (!user) {
      callback("couldn't find user with token:" + token, null);
      return
    }

    console.log("found user");
    console.log(user);

    if (user.local.signupTokenExpires < new Date()) {
      callback("signup token expired at:" + user.local.signupTokenExpires, null);
      return;
    }

    user.local.signupToken = null;
    user.local.signupTokenExpires = null;
    user.local.verified = true;
    // XXX should we store verification timestamp? maybe user creation timestamp also?

    user.save(function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, user);
      }
    });

  });

}

module.exports.createResetToken = function(user, callback) {
  // XXX do we care if this account has been verified or not?
  var config = require('./app').app.loadConfig('auth');
  user.local.resetToken = uuid.v4();
  user.local.resetTokenExpires = moment().add(config.confirmationTokenValidFor, 'hours');

  console.log(user.local);

  // save the user
  user.save(function(err) {
    if (err) {
      callback(err);
    } else {
      callback(null, user.local.resetToken);
    }
  });
}

module.exports.userForResetToken = userForResetToken = function(token, callback) {
  User.findOne({"local.resetToken":token}, function(err, user) {
    if (err || !user) {
      callback("Invalid password reset link", null);
      return;
    }

    if (user.local.signupTokenExpires < new Date()) {
      callback("Reset link has expired", null);
      return;
    }

    callback(null, user);
  });
}

module.exports.resetPasswordWithToken = function(token, pass1, pass2, callback) {
  userForResetToken(token, function(err, user) {
    if (err) {
      callback(err, null);
      return;
    }

    if (pass1 != pass2) {
      callback("Passwords do not match", null)
      return;
    }

    user.local.resetToken = null;
    user.local.resetTokenExpires = null;
    user.local.password = user.generateHash(pass1);

    user.save(function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, user);
      }
    });

  });

}
