// pay-balanced.js  route
var User                    = require('../models/user');
var FundingInstrument       = require('../models/funding-instrument');
var FinancialTransaction    = require('../models/financial-transaction');
var Subscription            = require('../models/subscription');
var Campaign                = require('../models/campaign');
var Fund                    = require('../models/fund');
var bp                      = require('../lib/oc-balanced');
var async                   = require('async');
var u                       = require('../lib/utils');

DBG_ON = false;

module.exports.fundCampaignGet = function(req,res,user){
  // get the provided campaign id if any; default to default campaign.
  var theCampaign;
  var theUser = (req.user ? req.user : user);
  var campaign_id = req.param('id');
  campaign_id = (campaign_id ? campaign_id : Campaign.DEFAULT_ID); 

  Campaign.findOne({_id: campaign_id}
   ,function(err,campaignBack){
    if(err) throw err;
    theCampaign = campaignBack;
    res.render('fund-campaign.html', {
        campaign:   { name: theCampaign.name, id: theCampaign._id},
        showCCForm: (theUser.activeFI ? false : true) });
  });

}
/*
 * fundCampaign() – JSON POST handler. 
 * ----------------------------------
 *  Expected data sent as json:
 *   amount           – REQUIRED - in USD cents, by default.
 *   currency         - OPTIONAL - if absent USD assumed. 
 *   campaignId       - OPTIONAL - recipient campaign id; if absent assume the default One Commons campaign.
 *   frequency        - OPTIONAL - same as enum of subscription frequency; default = 'once'
 * 
 * following fields should either ALL be included or ALL be absent:
 *   ccToken          - OPTIONAL - card token; if absent, assumes user has a valid FundingInstrument; if not, FAIL.
 *   ccLastFour       - OPTIONAL - card info
 *   ccNameOnCard     - OPTIONAL - 
 *   ccCVV            - OPTIONAL - nnn 3 digit cvv code.
 *   ccExpirationDate - OPTIONAL - mmyy
 *   cctype           - OPTIONAL - one of ["amex", "discover","mastercard","visa","diners-club","jcb",'']
 * ------------------------------------
 * 
 * will respond with a JSON object with:
 *  status: ['noFI', 'succeeded', 'failed']
 *  comment:  – reason for failure, if any.
 *  
 */
module.exports.fundCampaignPost = function(req,res, user){
  // check args: amount provided? if not  ret failed / 'amount unspecified'
  var data = req.body;
  var locals = {};
  locals.theUser = (req.user ? req.user : user);

  if(typeof(data.amount) === 'undefined'){
    res.json({status: 'failed', comment: 'no amount provided'});
    return;
  }

  locals.theCampaignId = (data.campaignId ? data.campaignId : '@Campaign@0');

  // defining functions to call in async.series.
  var setupFI = function(done){
    if(typeof(data.ccToken) === 'undefined') {
      // retrieve the existing user FI.
      FundingInstrument.findOne({_id: locals.theUser.activeFI}, 
        function(err, fiback){
          if(err || !fiback) { res.json({status: 'noFI', comment: 'user has no funding instrument'}); done(); return }
          locals.fi = fiback;
          if(data.frequency != locals.fi.frequency){
            locals.fi.frequency = data.frequency;
            locals.fi.save(done);
          } else { done()}
        });
    } else {
      // data has been submitted to create a new FI and tie it to the user.
      locals.fi                        = new FundingInstrument();
      locals.fi.user                   = locals.theUser._id;
      locals.fi.ccLastFour             = data.ccLastFour;
      locals.fi.ccType                 = data.ccType;
      locals.fi.ccNameOnCard           = data.ccNameOnCard;
      locals.fi.ccToken                = data.ccToken;
      locals.fi.ccExpirationDate       = data.ccExpirationDate;
      locals.fi.ccCVV                  = data.ccCVV;
      locals.fi.save(function(err, fiback){
        locals.fi = fiback;
        u.dbg('fiback in payments', fiback);
        if(err || !fiback) { res.json({status: 'failed', comment: 'funding instrument creation failed'}); done(); return }
        done();
      });
    }
  } // var setupFI()

  var setupSubscription = function(done){
    Subscription.findOne({user: locals.theUser.id, campaign: locals.theCampaignId },
      function(err,subBack1){
        if(err) { res.json({status: 'failed', comment: 'error finding subscription'}); done(); return }
        if(!subBack1){
          // create a new subscription and save it.
          locals.sub = new Subscription();
          locals.sub.user = locals.theUser.id;
          locals.sub.campaign = locals.theCampaignId;
          locals.sub.save(function(err,subBack2){
            if(err){ res.json({status: 'failed', comment: 'error creating subscription'}); done(); return }
            locals.sub = subBack2;
            done();
          })
        } else {
          locals.sub = subBack1;
          done();
        }
      })
  } // var setupSubscription()


  var setupFT = function(done){
    u.dbg("LOCALS on setupFT", locals);
    // setup FT to define transaction.
    locals.FT               = new FinancialTransaction();
    locals.FT.user          = locals.theUser._id;
    locals.FT.subscription  = locals.sub;
    locals.FT.fi            = locals.fi._id;
    locals.FT.amount        = data.amount;
    locals.FT.currency      = (data.amount ? data.amount : locals.FT.currency);
    locals.FT.campaign      = data.campaignId;

    done();
  }

  var doDebit = function(err){
    var resJSON = {};
    // actually do the transaction. All necessary data is in locals.FT or locals.fi.
    locals.FT.doDebit(null, function(err, ftback){
      if(err) { throw err }
      res.json({status: ftback.status, comment: ftback.description});
    })
  } // var doDebit()

  async.series([setupFI, setupSubscription, setupFT], doDebit);

} // fundCampaignPost()

// setup users payment plan and do a payment transaction with balanced API.
// optional 3rd 'user' arg is used in testing, set up when route is defined.
module.exports.setupPaymentPlanPost = function(req, res, user) {
  
       var data = req.body;

       var resultStatus = 'error';
       var resultMessage = 'nothing happened';

       var theUser =  (req.user ? req.user : user); // optional user passed while testing, in prod will be undefined.

       u.dbg('theUsers', [theUser, req.user, user]);

       // validate fields.
       if( data.fundingInstrument.match(/\/cards\//) === null) {
        res.json({status: 'error', message: "bad funding instrument token, no transaction attempted."});
        return;
       }

       // validate min/max amount of transaction? 
       if(data.donationAmount < bp.minAmount || data.donationAmount > bp.maxAmount){
        res.json({status: 'error', message: "no transaction attempted, payment amount out of range: " + data.amount / 100.0 })
       }

       /* entering 5-deep callback waterfall!!! */
       bp.debitCard(data.fundingInstrument, {amount: data.donationAmount }
         ,function(err,bp_reply){
            var now = new Date;

            if(err) {
              res.json({status:'error', 
                  message: "error done(); returned from balanced payments",
                  bp_reply: bp_reply });
              done(); return;
            }

            u.dbg('bp_reply', bp_reply);
            // no err, but there still could be a transaction failure. If so, record it and done(); return.
            if(bp_reply.errors) {
              var fft = new FinancialTransaction();
              fft.status = 'fail';
              fft.user = theUser._id;
              fft.date = now;
              fft.amount = data.donationAmount;
              fft.description = bp_reply.errors[0].status +
                             ' ' + bp_reply.errors[0].description;
              fft.save(
              function(){
                res.json({status: bp_reply.errors[0].status,
                    message: bp_reply.errors[0].description,
                    bp_reply: bp_reply });
              });
              done(); return;
            }

            // If we got here, payment succeeded: 
            // Create FI, edit user payment plan, create a success FT record, and done(); return success.

            var fi                   = new FundingInstrument();
            fi.user                  = data.userId;
            fi.ccLastFour            = data.cclastfour;
            fi.type                  = 'cc';
            fi.ccType                = data.cctype;
            fi.ccNameOnCard          = data.ccname;
            fi.ccType                = data.cctype;
            fi.ccExpirationDate      = data.ccexp;
            fi.ccToken              = data.fundingInstrument;

            fi.save(
            function(err, fiback){
              fi._id = fiback._id;

              // setup users payment plan.
              User.findOne({_id: theUser._id}
              ,function(err,uFound){
                if(err) { throw err }
                uFound.paymentPlan =  {
                        frequency: data.donationFrequency, 
                        lastCharge: now,
                        fi: fi._id
                };

                uFound.save(
                function(err, uback){
                  if(err) { throw err }
                  // save financial transaction
                  var bpdata = bp_reply.debits[0];
                  ft = new FinancialTransaction();
                  ft.status = 'succeeded';
                  ft.user = theUser._id;
                  ft.transactionType = 'subscriptionDebit'; // default value.
                  ft.fi = fi._id;
                  ft.date = now;
                  ft.amount = bpdata.amount;
                  ft.currency = bpdata.currency;
                  ft.transactionNumber = bpdata.transaction_number;
                  ft.appearsOnStatementAs = bpdata.appears_on_statement_as;
                  ft.description  = bpdata.description;

                  u.dbg('defined ft', ft);
                  ft.save(
                  function(err, ftback){
                    if(err) { throw err }
                    u.dbg('saved ft', ftback);
                    // send response.
                    res.json({
                      status: bp_reply.debits[0].status,
                      message: 'transaction Number ' + bp_reply.debits[0].transaction_number + ' ' + bp_reply.debits[0].description,
                      bp_reply: '[omitted]' // bp_reply
                    });

      }) }) }) }) }); // bp.debitCard(function(){ ... 

} // module.exports.setupPaymentPlanPost