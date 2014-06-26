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
  var sharedPageVars = utils.sharedPageVars.bind(app);
  //enables named routes, eg <a href='{{routes.profile}}'>my profile</a>
  return {

    index:            ['', sharedPageVars, utils.renderer('index.html')],

    login:            { get:  [ sharedPageVars, login.login],
                        post: [ login.loginPost(passport)]},

    logout:           login.logout,

    signup:           { get:  login.signup,
                        post: [ sharedPageVars, login.signupPost(passport)]},

    setupPaymentPlan: { path: 'profile/setup-payment-plan',
                        get:  [ sharedPageVars, utils.isLoggedIn, utils.renderer('setup-payment-plan')],
                        post: [ utils.isLoggedIn, payments.setupPaymentPlanPost] },

    fundCampaign:     { path: 'fund-campaign/:id',
                        get:  [ sharedPageVars, utils.isLoggedIn, payments.fundCampaignGet],
                        post: [ utils.isLoggedIn, payments.fundCampaignPost] },

    fundCampaignNoId: { path: 'fund-campaign',
                        get:  [ sharedPageVars, utils.isLoggedIn, payments.fundCampaignGet] },

    datarequest:      { post: datarequest},

    profile:          [ utils.isLoggedIn, sharedPageVars, login.profile],

    userTransactions: [ 'profile/transactions', utils.isLoggedIn, sharedPageVars, profile.transactionHistory],

    jswig:            ['jswig/*', jswig(app)],

    fbAuth:           ['auth/facebook', login.facebookAuth],

    fbAuthCallback:   ['auth/facebook/callback', login.facebookAuthCallback],
  };
}
