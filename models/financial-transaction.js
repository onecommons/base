// app/models/transaction.js

var mongoose                = require('mongoose');
var createModel             = require('../lib/createmodel');
var bp                      = require('../lib/oc-balanced');
var User                    = require('./user');
var FundingInstrument       = require('./funding-instrument');
var Subscription            = require('./subscription');
var x                       = require('../lib/utils');

// define the schema for our transaction model
var financialTransactionSchema = mongoose.Schema({
  status                        : { type: String, enum: ['prepare', 'succeeded', 'failed'], default: 'prepare'},
  subscription                  : { type: String, ref: 'Subscription'},
  fi                            : { type: String, ref: 'FundingInstrument'}, 
  transactionType               : { type: String, 
                                     enum: ['oneTimeDebit', 'subscriptionDebit', 'credit', 'refund', 'chargeBack'], 
                                     default: 'subscriptionDebit'},
  paymentProcessor              : { type: String, enum: ['balancedPayments', 'stripe', 'payPal'], default: 'balancedPayments' },
  date                          : { type: Date, default: Date.now },
  amount                        : { type: Number, max: 1500000, min: 100},
  currency                      : { type: String, default: 'USD' }, 
  appearsOnStatementAs          : { type: String, default: 'OneCommons' },
  description                   : { type: String, default: 'normal subscription debit' },
  campaign                      : { type: String, ref: 'Campaign'},
  processorTransactionId        : String,  // in BP, e.g. debits.id
  processorTransactionNumber    : String   // in BP, e.g. debits.transaction_number
});

DBG_ON = true;

// do an account debit using current settings of an FT. Callback is passed the 
// state of the saved FT record after the transaction is attempted or completed.
// Call this on a FT object, either pre-populated or to be populated with the options
// array, which can have entries for these field in the FT schema: 
//  user, fi, transactionType, paymentProcessor, amount, currency, appearsOnStatementAs, description.
//
// On return, date will be set and status will be 'succeeded' or 'failed'.
//  processorTransactionId and processorTransactionNumber will be set from the processor reply,
//  and if it is a paymentPlanDebit, the user payment plan 'lastCharge' will be set to refer to this transaction.
//

financialTransactionSchema.methods.doDebit = function(options, callback){

  theFT = this;
  var theUser, theFI;
  var amount, description, theBPToken;

  function errExit(ft,user,cb, err1){
    ft.save(function(err, ftback){
     if(false /*user != null */ ) { user.save(cb(err1, ft)) }
     else { cb(err1, ft) }
    })
  }

  function successExit(ft,user,cb){
    ft.save(function(err, ftback){
      if(err){ throw new Error("couldnt save FT"); }
      user.paymentPlan.lastCharge = ftback._id;
      user.save(cb(null, ftback));
    });
  }


  for(key in options){
     theFT[key] = options[key];
  }


  theFT.date = new Date;
  // first, easy synchronous error returns:

  if( theFT.paymentProcessor !== 'balancedPayments'){
    theFT.status = 'failed';
    theFT.description = 'failed transaction: unsupported payment processor ' + theFT.paymentProcessor;
    errExit(theFT, null, callback, new Error(theFT.description));
    return;
  } 

  if( theFT.transactionType !== 'subscriptionDebit') {
    theFT.status = 'failed';
    theFT.description = 'Transaction type ' + theFT.transactionType + ' not yet supported'; 
    errExit(theFT, null, callback, new Error(theFT.description));
    return;
  }
  

  // // OK, entering callback chain.

  User.findById(theFT.user, 
    function(err,u){
      if(!u){ 
        theFT.status = 'failed'; theFT.description = 'couldnt find user'; 
        errExit(theFT, theUser, callback, new Error(theFT.description));
        return;
      }

      theUser = u;

      
      if(theFT.transactionType === 'paymentPlanDebit'){
        theFT.amount = theUser.paymentPlan.amount;
        theFT.fi = theUser.paymentPlan.fi;
      }
      
      
      FundingInstrument.findById(theFT.fi, 
        function(err,fi){
          if(!fi || !theFT){ 
            theFT.status = 'failed'; theFT.description = "couldn't find Funding Instrument"; 
            errExit(theFT, theUser, callback, new Error(theFT.description) );
            return;
          }

          theFI = fi;
          theBPToken = theFI.ccToken;
          bp.debitCard(theBPToken, 
                      { amount:                  theFT.amount, 
                        appears_on_statement_as: theFT.appearsOnStatementAs, 
                        description:             theFT.description }, 
            function(err, bp_reply){
              if(err){ 
                theFT.status = 'failed'; theFT.description = "couldn't reach payment processor or bad card token";
                errExit(theFT, theUser, callback); // , new Error(theFT.description));  
                return;

              } 

              if (bp_reply.errors){ 
                theFT.status = 'failed';
                theFT.description = bp_reply.errors[0].description;
                if(bp_reply.debits){
                  theFT.processorTransactionId          = bp_reply.debits[0].id;
                  theFT.processorTransactionNumber      = bp_reply.debits[0].transaction_number;
                }
                errExit(theFT, null, callback); // , new Error(theFT.description));
                return;

              } 

              // else success!
              theFT.status                          = 'succeeded';
              theFT.description                     = bp_reply.debits[0].description;
              theFT.processorTransactionId          = bp_reply.debits[0].id;
              theFT.processorTransactionNumber      = bp_reply.debits[0].transaction_number;

              if(theFT.transactionType === 'paymentPlanDebit'){
                theUser.paymentPlan.lastCharge = theFT._id;
              }
              successExit(theFT, theUser, callback);
              return;
      }) }) })

}


// Refund an existing debit. THIS is the existing debit transaction to be refunded.
// Creates a new FT for the refund, and executes low level bp.refundDebit().
// callback is passed err and the newly created FT representing the refund.
// Expects payment processor to be BP.
financialTransactionSchema.methods.refundDebit = function(callback){
  var debitFT = this;
  var refundFT = new FinancialTransaction();

  function rdExit(newFT, cb, err){
    newFT.save(function(rft){
      cb(err, newFT);
    })

  }

  refundFT.transactionType = 'refund';
  refundFT.amount = debitFT.amount;
  refundFT.currency = debitFT.currency;
  refundFT.user = debitFT.user;
  refundFT.fi   = debitFT.fi;

  if(debitFT.paymentProcessor !== 'balancedPayments'){
    refundFT.status = 'failed';
    refundFT.description = 'paymentProcessor must be Balanced Payments: transaction aborted';
    rdExit(refundFT, callback, new Error(refundFT.description));
  } else {
    bp.refundDebit(debitFT.processorTransactionId, debitFT.amount, "refund for " + debitFT.description,
      function(err, bp_reply){
        if(err){
          // handle deep no-connect error
          refundFT.status = 'failed';
          refundFT.description = "couldn't reach payment processor to refund debit " + debitFT.processorTransactionId;
          rdExit(refundFT, callback, new Error(refundFT.description));
        } else {
          if(bp_reply.errors){
            // handle failed refund from BP
            refundFT.status = 'failed';
            refundFT.description = bp_reply.errors[0].description + ' attempt to refund debit ' + debitFT.processorTransactionId;
            refundFT.processorTransactionId = bp_reply.errors[0].request_id;
            rdExit(refundFT, callback, new Error(refundFT.description));
          } else {
            // success!
            var rfr = bp_reply.refunds[0];
            refundFT.status = 'succeeded';
            refundFT.processorTransactionId = rfr.id;
            refundFT.processorTransactionNumber = rfr.transaction_number;
            refundFT.description = rfr.description;
            rdExit(refundFT, callback, null);
          }
        }
    });
  } // else

} // financialTransactionSchema.methods.refundDebit()



// expose model and schema to our app.

var FinancialTransaction = module.exports = createModel('FinancialTransaction', financialTransactionSchema);
