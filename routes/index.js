var utils           = require('../lib/utils');
var express         = require('express');

var about           = require('./about'); //XXX delete from app
var jswig           = require('./jswig');
var blogpost        = require('./blogpost'); //XXX delete from app
var login           = require('./login');
var profile         = require('./profile');
var directory       = require('./directory'); //XXX delete from app
var datarequest     = require('./datarequest');
var payments        = require('./payments');

module.exports = function(app, passport) {
  //enables named routes, eg <a href='{{routes.profile}}'>my profile</a>
  return {

    index:            ['', utils.renderer('index.html')],

    login:            { get:  [ login.login],
                        post: [ login.loginPost(passport)]},

    logout:           login.logout,

    signup:           { get:  login.signup,
                        post: [ login.signupPost(passport)]},

    verification:     login.verification,

    verificationPost: [ 'verification/:token', login.verificationPost ],

    verificationResend: { path: 'verification-resend',
                          get: login.resendVerification,
                          post: login.resendVerificationPost(passport) },

    setupPaymentPlan: { path: 'profile/setup-payment-plan',
                        get:  [ utils.isLoggedIn, utils.renderer('setup-payment-plan')],
                        post: [ utils.isLoggedIn, payments.setupPaymentPlanPost] },

    fundCampaign:     { path: 'fund-campaign/:id',
                        get:  [ utils.isLoggedIn, payments.fundCampaignGet],
                        post: [ utils.isLoggedIn, payments.fundCampaignPost] },

    fundCampaignNoId: { path: 'fund-campaign',
                        get:  [ utils.isLoggedIn, payments.fundCampaignGet] },

    datarequest:      { post: datarequest},

    profile:          [ utils.isLoggedIn, login.profile],

    userTransactions: [ 'profile/transactions', utils.isLoggedIn, profile.transactionHistory],

    jswig:            ['jswig/*', jswig(app)],
  };
}
