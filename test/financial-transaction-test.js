var express     = require('express');
var request     = require('supertest');
var assert      = require('chai').assert;
var mongoose    = require('mongoose');
var bp          = require('../lib/oc-balanced');
var m           = require('../models');
var bodyParser = require('body-parser');

describe('FT', function () {

    var db, theUser, theFI, theFT;
    var theUserPwd = 'testuser';

    this.timeout(10000); // 10 s

    var app = express();
    app.use(bodyParser.urlencoded());
    app.use(bodyParser.json());
    var spp = require('../routes/payments').setupPaymentPlanPost;
    app.post('/setup-payment-plan', spp); // add jswig routes to app.


    before(function(done) {
      mongoose.connection.close();
      db = mongoose.connect('mongodb://localhost/ocdemo-unittest');
      done();
    });

    beforeEach(function(done){

      // clear users and add test user record
      m.User.remove({} ,function(){
        theUser                   = new m.User();
        theUser.displayName       = "TestGuy";
        theUser.local.email       = "test@user.com"
        theUser.local.password    = "$2a$08$/06iuOSo3ws1QzBpvRrQG.jgRwuEJB20LcHsWyEWHhOEm/ztwqPG."; // "testuser"
        theUser._id               = "@User@0";
        theUser.paymentPlan.amount    = "2000";
        theUser.paymentPlan.frequency = 'monthly';
        //     .paymentPlan.lastCharge = null   (by default)

        theUser.save( function(err, uback){
          theUser = uback;
          m.FundingInstrument.remove({} ,function(){
            theFI              = new m.FundingInstrument();
            theFI.user         = theUser._id;
            theFI.ccToken     = '/cards/CC6EdoVFsRDJbOrHvNcmq6VR' // good test card
            theFI.save( function(err, fiback){
              theFI = fiback;
              theUser.activeFI = theFI._id;
              theUser.save(function(err,uback){
                theUser = uback;
                m.FinancialTransaction.remove({}, function(){
                    theFT             = new m.FinancialTransaction();
                    theFT.user        = theUser._id;
                    theFT.fi          = theFI; // theUser.paymentPlan.fi;
                    theFT.amount      = theUser.paymentPlan.amount;
                    theFT.save(done);
                  })
              });
            });
          });
        });
      });
    }); // beforeEach()

    it('should do a proper debit with the given correct data', function(done){
      // confirm theFT is fully filled in.
      assert.isNotNull(theFT.fi);
      assert.isNotNull(theFT.user);
      assert.isNotNull(theFT.amount);
//      console.log(theFI);
      theFT.doDebit({}, function(err, ftback){
        assert.isNull(err);
        assert.equal(ftback.status, 'succeeded');
        done();
      })
    });

    it('shouldnt do a credit yet', function(done){
      theFT.doDebit({ transactionType: 'credit'}, function(err, ftback){
        assert.isNotNull(err);
        //console.log(err);
        done();
      })
    });

    it('shouldnt do a proper debit with an unsupported payment processor', function(done){
      theFT.doDebit({ paymentProcessor: 'stripe'}, function(err, ftback){
        assert.isNotNull(err);
        //console.log(err);
        done();
      })
    });


    it('shouldnt do anything if user unfound', function(done){
      theFT.doDebit({ user: undefined }, function(err, ftback){
        assert.isNotNull(err);
        done();
      })
    });


    it('should give proper error if card refused', function(done){
      theFI.ccToken = "/cards/CC3h0aMqs0opvI0UAq7LS1O2"; // bad card.
      theFI.save(function(){
        theFT.doDebit({}, function(err, ftback){
          assert.isNotNull(err);
          done();
        })
      })
    });

    it('on a debit, should give proper error if cant reach payment processor', function(done){
      theFI.ccToken = "/xxxxx"; // completely whack url.
      theFI.save(function(){
        theFT.doDebit({}, function(err, ftback){
          assert.isNotNull(err);
          done();
        })
      })
    });

    it('should refund a valid debit, but only once', function(done){
      theFT.doDebit({}, function(err, ftback){
        assert.isNull(err);
        assert.equal(ftback.status, 'succeeded');
        theFT = ftback;
        theFT.refundDebit(function(err, refundFT){
          assert.isNull(err);
          assert.equal(refundFT.status, 'succeeded');
          theFT.refundDebit(function(err, refundFT2){
            assert.isNotNull(err);
            assert.equal(refundFT2.status, 'failed');
            done();
          });
        })
      })
    }) // it


});
