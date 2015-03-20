var moment = require('moment');
var u         = require('../models/user');
var crypto = require('crypto');
var log = require('./log');

module.exports.recordLogin = function(user, status, ipAddress) {
    var hist = new require('../models/loginhistory')();
    hist.user = user;
    hist.ip = ipAddress;
    hist.status = status;

    hist.save(function(err) {
        if (err) {
            log.error(err, "Error saving login history for %s", user.id);
        }
    });
}

module.exports.checkVerificationToken = function(token, callback) {
  if (!token)  {
    callback("Unable to confirm email: invalid URL");
    return;
  }
  u.User.findOne({"local.signupToken":token}, function(err, user) {
    if (err) {
      callback(err);
      return;
    }

    if (!user) {
      callback("Unable to confirm email: not found");
      return
    }

    log.info("verified user %s with %s", user._id, token);
    user.local.verified = true;

    user.save(function(err) {
      if (err) {
        callback(err);
      } else {
        callback(null, user);
      }
    });

  });

}

module.exports.createResetToken = function(user, callback) {
  // XXX do we care if this account has been verified or not?
  var config = require('./app').app.loadConfig('auth');
  user.local.resetToken = crypto.randomBytes(32).toString('hex');
  user.local.resetTokenExpires = moment().add(config.resetTokenValidMinutes, 'minutes');

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
  if (!token)  {
    callback("Invalid reset token");
    return;
  }

  u.User.findOne({"local.resetToken":token}, function(err, user) {
    if (err) {
      callback(err);
      return;
    }

    if (!user) {
      callback("Invalid password reset link", null);
      return;
    }

    if (user.local.resetTokenExpires < new Date()) {
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
    user.local.password = u.User.generateHash(pass1);

    user.save(function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, user);
      }
    });

  });

}

module.exports.changePassword = function(user, pass1, pass2, callback) {
    if (pass1 != pass2) {
      callback("Passwords do not match", null)
      return;
    }

    user.local.password = u.User.generateHash(pass1);
    user.save(function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, user);
      }
    });
}
