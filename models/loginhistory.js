var createModel = require('../lib/createmodel');

/*
 Status codes:
 'ok' - successful login
 'fail' - unsuccessful login
 'lock' - the account was locked on this login attempt
 'reject' - an attempt was made to log into a locked/disabled account
 'unverified' - account has not completed email verification
*/

module.exports = createModel('LoginHistory', {
    user           : { type: String, ref: 'User'},
    ip             : String,
    when           : { type: Date, default: Date.now },
    status         : { type: String, enum: ['ok', 'fail', 'lock', 'reject', 'unverified'], default: null}
});

