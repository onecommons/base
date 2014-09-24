var mongoose = require("mongoose");
var createModel = require('../lib/createmodel');
var assert = require('chai').assert;

describe('createModel', function(){
    var db;
    var s;

    before(function(done) {
        s = new mongoose.Schema({
             //__t: String,
             // _id: String,
             prop1: []
             },{strict: 'throw'});
        s.statics.testStatics = function() { console.log('teststatic'); }
        s.methods.testMethods = function() { console.log('testmethods'); }
        var config = require('../lib/config')()('app');
        db = mongoose.connect(config.dburl, done);
    });

    after(function(done){
      db.connection.db.dropDatabase(function(){
        mongoose.connection.close(done);
      });
    });

    it('should make a model and instance based on a schema', function(done) {

        var Test = createModel("Test", s);
        var t = new Test();
        assert(Test.check);
        assert(t.check);
        t.save(function() {
            Test.findOne(function(err,doc) {
                assert.instanceOf(doc, Test);
                done();
            })
        });
    });

     it('should make a model and instance without a schema', function(done) {
        var Test3 = createModel("Test3", {prop2: String});
        var t = new Test3();
        t.setPrinciple({role:'admin'}); //test access control
        t.save(function(err) {
            assert(!err,String(err));
            Test3.findOne(function(err,doc) {
                assert(!err);
                assert.instanceOf(doc, Test3);
                done();
            })
        });
    });

    it('should make a base and a derivative model', function(done) {
        var Testbase = createModel("Testbase",{prop2: String});
        var Testd = createModel("Testd",
            {prop3: String, prop4: String},  Testbase);

        var base = new Testbase();
            base.save();

        var derived = new Testd();
        derived.prop4 = "This is prop4";
        derived.save(function() {
          Testbase.findOne({_id: base._id}, function(err, doc) {
            assert.instanceOf(doc, Testbase);
            Testbase.findOne({_id: derived._id}, function(err,doc2){
                assert.equal(doc2.prop4, "This is prop4");
                assert.instanceOf(doc2,Testd);
                done();
            });
          });
        });

   });


 it('should make a model and instance based on a schema and a derivative from it', function(done) {
        var s2 = new mongoose.Schema({
             //__t: String,
             // _id: String,
             prop1: []
             }, {strict: 'throw'});

        var Test2 = createModel("Test2", s2);
        var Test2Deriv = createModel("Test2Deriv", {parent: String}, Test2);
        var td = new Test2Deriv();
        td.parent = 'test';
        var t = new Test2();
        t.save(function(err, doc) {
            assert(!err);
            assert(doc instanceof Test2);
            td.save(function(err, doc) {
              Test2.findOne(function(err,doc) {
                  assert.instanceOf(doc, Test2);
                  Test2Deriv.findOne(function(err,doc){
                      assert.instanceOf(doc,Test2Deriv);
                      done();
                  });
               });
           });
        });
    });



 }); // describe...
