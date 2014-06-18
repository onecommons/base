var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var assert = chai.assert;
var mongoose = require('mongoose');

var bp           = require('../lib/oc-balanced');
var httpRequest  = require('request');

describe('oc-balanced api', function(){
  var aToken = "/cards/CC5O7VeGswfdoJ3xCL8r8BPD";
  var aBogusToken = "this-is-a-stinky-token";
  var api_key = 'ak-test-eyoGATiAg6YE5thvhSiWIi7NE0zg0l0U'; // for now test

  this.timeout(10000); // 10 s

   before(function(done) {
      if(typeof mongoose !== 'undefined'){
        mongoose.connection.close();
      }
      db = mongoose.connect('mongodb://localhost/ocdemo-unittest', done);
      s = new mongoose.Schema({
           //__t: String,
           // _id: String,
           prop1: []
           },{strict: 'throw'});
      
    });
    
    afterEach(function(done) {
        db.connection.db.dropDatabase(done);
    });
    
    after(function(done){
      db.connection.db.dropDatabase(function(){
        db.connection.close(function(){
          done();
        });
      });
    });

  it('should debit a card using httpRequest raw', function(done){
      var reqSettings = {
          url:  "https://api.balancedpayments.com" + aToken + '/debits',
          auth: { user: api_key, pass: '', sendImmediately: true },
          json: { "amount": 5000, 
                  "appears_on_statement_as": "statement blab",
                  "description": "dashboard blabbery" }
      }
      httpRequest.post(reqSettings, function(err, res, body){
        if(body.status_code >= 400){
          throw(err);
        }
        done();
      });
  });

  it('should debit a card using cb based debitCard() method', function(done){
     bp.debitCard(aToken, { "amount": 5000, 
                  "appears_on_statement_as": "statement blab",
                  "description": "dashboard blabbery" },
                  function(err,data){
                    //console.log(data.debits);
                    assert.property(data,'debits');
                    assert.deepPropertyVal(data,'debits[0].status', 'succeeded');
                    done();
                  });
  });

  it('should NOT debit a card using cb based debitCard() method with bad FI and ERR out', function(done){
     bp.debitCard(aToken, { "amount": 0, 
                  "appears_on_statement_as": "statement blab",
                  "description": "dashboard blabbery" },
                  function(err,data){
                    if(err) {
                      assert.notNull(err);
                    } else {
                      //console.log(data);
                    }
                    done();
                  });
  });

  it('should NOT debit a card using cb based debitCard() method with bad amount fail w/out err', function(done){
     bp.debitCard(aToken, { "amount": 0, 
                  "appears_on_statement_as": "statement blab",
                  "description": "dashboard blabbery" },
                  function(err,data){
                    if(err) {
                      assert.notNull(err);
                    } else {
                      assert.equal(data.errors[0].status,'Bad Request');
                      //console.log(data);
                    }
                    done();
                  });
  });

  it('should debit, then credit a good card transaction once only', function(done){
      var debitId;
      var theAmount = 1000;
      bp.debitCard(aToken, { "amount": theAmount, 
                  "appears_on_statement_as": "statement blab",
                  "description": "dashboard blabbery" },
        function(err,data){
          assert.property(data,'debits');
          assert.deepPropertyVal(data,'debits[0].status', 'succeeded');
          debitId = data.debits[0].id;

          // do refund.
          bp.refundDebit(debitId, theAmount, "refund description",
            function(err,rr){
              assert.deepPropertyVal(rr,'refunds[0].status', 'succeeded');
              assert.equal(rr.refunds[0].amount, theAmount);
              assert.equal(rr.refunds[0].links.debit, debitId);

              // try another refund on same original debit transaction; should fail.
              bp.refundDebit(debitId, theAmount, "refund description",
                function(err,rrr){
                  assert.deepPropertyVal(rrr, 'errors[0].status', "Bad Request");
                  done();
              })
          });
      });
  });

  
 }); // describe...

