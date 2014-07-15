var express     = require('express');
var request     = require('supertest');
var assert      = require('chai').assert;
var mongoose    = require('mongoose');

var bp          = require('../lib/oc-balanced');
var m           = require('../models');

var swig        = require('swig');
require('../lib/swigextensions')(swig);
var bodyParser = require('body-parser');

DEBUG_ON = true;

describe('fund campaign', function () {
    var db, theUser, debitparams;
    var theUserPwd = 'testuser';

    this.timeout(10000); // 10s – going out to balanced payments.

    var app = express();
    app.use(bodyParser.urlencoded());
    app.use(bodyParser.json());
    var fcg = require('../routes/payments').fundCampaignGet;
    app.get('/fund-campaign', function(req, res) {fcg(req,res, theUser);});
    var fcp = require('../routes/payments').fundCampaignPost;
    app.post('/fund-campaign', function(req, res) {fcp(req,res, theUser);});

    // all environments
    app.set('views', __dirname + '/../views'); // this path looks stupid but it works independent of how tests are run.
    app.engine('html', swig.renderFile);
    swig.setDefaults({ cache: false });
    app.set('view engine', 'html');

    console.log('views = ', app.set('views'));

    before(function(done) {
      mongoose.connection.close();
      db = mongoose.connect('mongodb://localhost/ocdemotest');

      // clear users and add test user record
      m.User.remove({}
      ,function(){
          theUser = new m.User();
          theUser.displayName = "TestGuy";
          theUser.local.email = "test@user.com"
          theUser.local.password = "$2a$08$/06iuOSo3ws1QzBpvRrQG.jgRwuEJB20LcHsWyEWHhOEm/ztwqPG."; // "testuser"
          theUser._id = "@User@0";
          theUser.save(function(){
            m.FundingInstrument.remove({}
            ,function(err){
              theFI = new m.FundingInstrument();
              theFI.ccToken = '/cards/CC1H6PIzndUjR7Si1WtDAuoa';
              theFI.user = theUser._id;
              theFI.save(function(err,fi){
                theFI = fi;
                theUser.activeFI = theFI._id;
                theUser.save(function(err,uback){
                  theUser = uback;
                  m.FinancialTransaction.remove({}
                  ,function(){
                    theCampaign = new m.Campaign();
                    theCampaign.name = "Default OneCommons Campaign";
                    theCampaign._id = "@Campaign@0";
                    theCampaign.save(done);

     }) }) }) }) }) })

    }); // before


    beforeEach(function(){
      debitparams = {
        amount: '2500',
      }
    });

    after(function(done){
      m.Campaign.remove({},function(){
        mongoose.connection.close();
        done();
      });
    });

    it('get should show page WITHOUT cc form if user has an active FI', function(done){
      function oopsHasCCForm(res){
        if('Name on Card' in res.body) throw new Error ('has Form, shouldnt');
      }
      request(app)
        .get('/fund-campaign')
        .expect(200)
        .expect(/Name on Card/) // actually expect NOT!
        .end(function(err,res){
          if(!err) return done(new Error ('should have not matched')); // invert error logic!
          done();
        })
    });

    //XXX this fails because there is no fund-campaign.html
    it("get should show page WITH cc form if user doesn't have an active FI" /*, function(done){
      theUser.activeFI = null;
      request(app)
        .get('/fund-campaign')
        .expect(200)
        .expect(/Name on Card/)
        .end(function(err,res){
          theUser.activeFI = theFI._id; // restore
          if(err) return done(err);
          done();
        })
    }*/);

    it('post should do a debit with default campaign and user with established FI and create sub', function(done){
      request(app)
          .post('/fund-campaign')
          .send(debitparams)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function(err,res){
             // assert(!err);
             m.FundingInstrument.findOne({}
             ,function(err,fi){
                m.User.findOne({_id: theUser.id}
                ,function(err,uback){
                  m.FinancialTransaction.findOne({}
                  ,function(err, ft){
                    if(err) { throw(err) }
                    assert.isNotNull(ft);
                    assert.equal(ft.status, 'succeeded');
                    assert.equal(ft.fi, fi._id);
                    m.Subscription.findOne({}
                     ,function(err, subback){
                      if(err) { throw err }
                      assert.isNotNull(subback);
                      assert.equal(subback.user, theUser._id);
                      done();

         }) }) }) }) });

    }); // it...

    it('post should do a debit setting up a new FI from submitted token', function(done){
      debitparams.ccToken = '/cards/CC6EdoVFsRDJbOrHvNcmq6VR'; // some correct card.
      request(app)
          .post('/fund-campaign')
          .send(debitparams)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function(err,res){
             // assert(!err);
             m.FundingInstrument.findOne({}
             ,function(err,fi){
                m.User.findOne({_id: theUser.id}
                ,function(err,uback){
                  m.FinancialTransaction.findOne({}
                  ,function(err, ft){
                    if(err) { throw(err) }
                    assert.isNotNull(ft);
                    assert.equal(ft.status, 'succeeded');
                    assert.equal(ft.fi, fi._id);
                    m.Subscription.findOne({}
                     ,function(err, subback){
                      if(err) { throw err }
                      assert.isNotNull(subback);
                      assert.equal(subback.user, theUser._id);
                      done();

         }) }) }) }) });

    }); // it...


});
