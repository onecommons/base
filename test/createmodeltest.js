var mongoose = require("mongoose");
var createModel = require('../lib/createmodel');
var assert = require('chai').assert;
var _ = require('underscore');

function runAccessTest(test, model, i, done) {
  var doc = new model();
  /*doc.pre('set', function (next, key, val) {
    console.log('set hook', key, val, 'old?', this[key], this.isNew);
    next();
  })*/
  doc.setPrinciple(createModel.getAccessControlPolicy().defaultPrinciple || { roles:['user']}) //XXX
  var prop = test[1];
  failed = false
  try {
    if (prop)
      doc[prop] = true;
  } catch (err) {
    failed = true;
    assert(!test[2], 'unexpected fail '+ i + ": " + err);
    done();
    return;
  }
  if (prop)
    assert(test[2] || failed, 'unexpected pass setting prop'+i);
  doc.save(function(err, doc) {
    if (!test[2])
      assert(err || !doc, 'unexpected pass '+i + " while saving: " + doc);
    done();
  });
}

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

  [
  [{"write:prop1": "admin",
    "create"       : "user"},
   "prop1", false],

  [{"write:prop1": "admin",
    "create:prop1" : "user"},
    "prop1", true],

  [{"create:prop1": "user",
    "create"      : "admin"},
    "prop1", true],

  [{"create:prop1": "user",
    "any"      : "admin"},
    "prop1", true],

  [{"any"       : "admin",
    "create"      : "user"},
    "prop1", true],

  [{"any"       : "admin",
    "create"      : "user"},
    null, true],

  [{"any"       : "user",
    "create"      : "admin"},
    "prop1", false],

  [{"any"       : "user",
    "create"      : "admin"},
    null, false],
  ].forEach(function(test, i){
    it('apply access control rules properly ' + i, function(done) {
      var m = createModel("TestAccess"+i, {prop1:Boolean}, null, test[0]);
      runAccessTest(test, m, i, done);
    });

    it('apply access control rules properly to derived models' + i, function(done) {
      //split access control map up:
      var pairs = _.pairs(test[0]);
      var base = createModel("TestAccessBase"+i, {}, null, _.object([pairs[0]]));
      //set prop1 on derived even though its op is defined in the base' access map
      var m = createModel("TestAccessDerived"+i, {prop1:Boolean}, base, _.object([pairs[1]]));
      runAccessTest(test, m, i, done);
    });

  });

  //XXX test default values

}); // describe...
