var utils           = require('../lib/utils');
var express         = require('express');

var about           = require('./about'); //XXX delete from app
var jswig           = require('./jswig');
var blogpost        = require('./blogpost'); //XXX delete from app
var login           = require('./login');
var directory       = require('./directory'); //XXX delete from app
var datarequest     = require('./datarequest');
var files           = require('./files');
var crud           = require('./crud');

module.exports = function(app, passport) {
  //enables named routes, eg <a href='{{routes.profile}}'>my profile</a>
  return {

    index:            ['', utils.renderer('index.html')],

    login:            { get:  [ login.login(app)],
                        post: login.loginPost(passport)},

    logout:           login.logout,

    signup:           { get:  utils.renderer('signup.html'),
                        post: [ login.signupPost(passport)]},

    //verification required page
    verification:     ['verification-required',
                        utils.renderer('verification-required.html')],

    //verification link in email
    verificationToken: [ 'verification/:token', login.verificationToken ],

    //re-send verification method
    verificationResend: { path: 'verification-resend',
                          post: login.resendVerification },

    //send forgot password email page and form handler
    forgot:           { get: login.forgot,
                        post: login.forgotPost(app) },

    //password reset page and form handler
    forgotToken:      { path: 'forgot/:token',
                        get:  login.forgotToken,
                        post: login.forgotTokenPost(app) },

    changePassword:   { path: 'change-password',
                        get:  [utils.isRecentlyLoggedIn, utils.renderer('change-password.html')],
                        post: [utils.isRecentlyLoggedIn, login.changePassword] },

    disableAccount:   { path: 'disable-account',
                        post: [utils.isRecentlyLoggedIn, login.disableAccount] },

    impersonate:      { path: 'admin/impersonate-user',
                        get:  [utils.requirePermission('admin'), utils.renderer('impersonate.html')],
                        post: [utils.requirePermission('admin'), login.impersonatePost(app)]
                      },

    datarequest:      { post: [utils.isLoggedIn, datarequest]},

    profile:          [ utils.isLoggedIn, utils.renderer('profile.html')],

    jswig:            ['jswig/*', jswig(app)],

    files:            ['admin/files', utils.requirePermission('admin'), files.showFiles],

    file:             ['admin/file/:id/:name?', utils.requirePermission('admin'), files.viewFile],

    crud:             ['admin/crud/:model', utils.requirePermission('admin'), crud.table],

    edit:             ['admin/edit/:id', utils.requirePermission('admin'), crud.edit],

    create:             ['admin/create/:model', utils.requirePermission('admin'), crud.create],

    error:   [ function() { throw Error('blah!');}]
  };
}
