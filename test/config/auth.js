// config/auth.js

// expose our config directly to our application using module.exports
module.exports = {
requireEmailVerification: false,
    failedLoginsWarning: 3,
    failedLoginAttempts: 5,
    accountLockedTime: 1 // seconds

};
