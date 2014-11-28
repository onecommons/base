var utils           = require('../lib/utils');
var express         = require('express');

var about           = require('./about'); //XXX delete from app
var jswig           = require('./jswig');
var blogpost        = require('./blogpost'); //XXX delete from app
var login           = require('./login');
var directory       = require('./directory'); //XXX delete from app
var datarequest     = require('./datarequest');
var files           = require('./files');

module.exports = function(app, passport) {
  //enables named routes, eg <a href='{{routes.profile}}'>my profile</a>
  return {

    index:            ['', utils.renderer('index.html')],

    login:            { get:  [ login.login(app)],
                        post: [ login.loginPost(passport)]},

    logout:           login.logout,

    signup:           { get:  login.signup,
                        post: [ login.signupPost(passport)]},

    verification:     login.verification,

    verificationToken: [ 'verification/:token', login.verificationToken ],

    verificationResend: { path: 'verification-resend',
                          get: login.resendVerification,
                          post: login.resendVerificationPost(app) },

    forgot:           { get: login.forgot,
                        post: login.forgotPost(app) },

    forgotToken:      { path: 'forgot/:token',
                        get:  login.forgotToken,
                        post: login.forgotTokenPost },

    datarequest:      { post: [utils.isLoggedIn, datarequest]},

    profile:          [ utils.isLoggedIn, login.profile],

    jswig:            ['jswig/*', jswig(app)],

    files:            [utils.requirePermission('admin'), files.showFiles],

    file:             ['file/:id/:name', utils.requirePermission('admin'), files.viewFile]
  };
}
