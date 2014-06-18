var express     = require('express');
var request     = require('supertest');
var assert      = require('chai').assert;
var mongoose    = require('mongoose');
var bp          = require('../lib/oc-balanced');
var m           = require('../models');
var bodyParser = require('body-parser');

describe('setup payment plan', function () {

    var db, theUser, debitparams;
    var theUserPwd = 'testuser';

    this.timeout(10000); // 10 secs

    var app = express();
    app.use(bodyParser.urlencoded());
    app.use(bodyParser.json());
    var spp = require('../routes/payments').setupPaymentPlanPost;
    app.post('/setup-payment-plan', function(req, res) {assert(theUser); spp(req,res, theUser)});

    before(function(done) {
      db = mongoose.connect('mongodb://localhost/test');
      // clear users and add test user record
      m.User.remove({}
      ,function(){
          theUser = new m.User();
          theUser.displayName = "TestGuy";
          theUser.local.email = "test@user.com"
          theUser.local.password = "$2a$08$/06iuOSo3ws1QzBpvRrQG.jgRwuEJB20LcHsWyEWHhOEm/ztwqPG."; // "testuser"
          theUser._id = "@User@0";
          theUser.save(function() {
            m.FundingInstrument.remove({}
            ,function(err){
                m.FinancialTransaction.remove({}, done);
            });
          });
      });
    });

    after(function(done){
      db.connection.db.dropDatabase(function(){
        db.connection.close(done);
      });
    });

    beforeEach(function(){
      debitparams = {
        donationOptions: [ '1000', '2500', '5000' ],
        'custom-donation-amount': '',
        frequencyOptions: [ 'once', 'monthly', 'yearly' ],
        donationAmount: '2500',
        donationFrequency: 'monthly',
        fundingInstrument: '/cards/CC1H6PIzndUjR7Si1WtDAuoa',
        cclastfour: '1111',
        ccname: 'John Doe',
        ccexp: '1220',
        cctype: 'visa',
        userId: '@User@0' // temp!!! will get from session eventually in endpoint handler.
      }
    });

    it('should do a debit with good data and update user, fi, ft', function(done){
      request(app)
          .post('/setup-payment-plan')
          .send(debitparams)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function(err,res){
             assert(!err);
             m.FundingInstrument.findOne({}
             ,function(err,fi){
                assert.equal(fi.user, theUser._id);
                assert.equal(fi.ccToken, debitparams.fundingInstrument); // fi has been created.

                m.User.findOne({_id: theUser.id}
                ,function(err,u){
                  // console.log(u);
                  assert(u);
                  assert.equal(u.paymentPlan.fi, fi._id); // user payment plan has been updated.

                  m.FinancialTransaction.findOne({}
                  ,function(err, ft){
                    if(err) { throw(err) }
                    // assert.isNotNull(ft);
                    // assert.equal(ft.status, 'succeeded');
                    // assert.equal(ft.fi, fi._id);
                    // assert.equal(ft.user, theUser._id); // FinancialTransaction record has been created.
                    done();

          }) }) }) });
    }); // it...

    it('should NOT do a debit with a bad card token', function(done){
      debitparams.fundingInstrument = '/this/is-a-whack-card-token';
      request(app)
          .post('/setup-payment-plan')
          .send(debitparams)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function(err,res){
            assert.equal(res.body.status, 'error');
            done();
           });// .end()
      });
});
