// config/auth.js

// expose our config directly to our application using module.exports
module.exports = {

    recentLoginTimeoutSeconds: 60, //seconds

    failedLoginsWarning: 3,
    failedLoginAttempts: 5,
    accountLockedTime: 60 * 5, // seconds
    sendWelcomeEmail: true,
    requireEmailVerification: false, //'silent', 'nag', 'require'
    resetTokenValidMinutes: 30

    //signupCompleteRedirect: '/profile',
    //loginRedirect: '/profile',
    //passwordResetRedirect: '/profile',
    //verificationRedirect: '/profile',
    //impersonateRedirect: '/profile',

    // 'facebookAuth' : {
    //     'clientID'      : 'your-app-id',
    //     'clientSecret'  : 'your-app-secret',
    //     'callbackURL'   : 'http://localhost:8080/auth/facebook/callback'
    // },

    // 'twitterAuth' : {
    //     'consumerKey'       : 'your-consumer-key-here',
    //     'consumerSecret'    : 'your-client-secret-here',
    //     'callbackURL'       : 'http://localhost:8080/auth/twitter/callback'
    // },

    // 'googleAuth' : {
    //     'clientID'      : 'your-secret-clientID-here',
    //     'clientSecret'  : 'your-client-secret-here',
    //     'callbackURL'   : 'http://localhost:8080/auth/google/callback'
    // },

};
