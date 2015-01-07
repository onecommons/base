var mongoose = require("mongoose");
var createModel = require('../lib/createmodel');
var assert = require('chai').assert;
var _ = require('underscore');
var Promise = require('promise');

function runAccessTest(test, model, i, done) {
  var doc = new model();
  /*doc.pre('set', function (next, key, val) {
    console.log('set hook', key, val, 'old?', this[key], this.isNew);
    next();
  });*/
  doc.setPrinciple(createModel.getAccessControlPolicy().defaultPrinciple || { roles:['user']})
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
    assert(test[2] || failed, 'unexpected pass setting prop '+prop+ " on " + i);
  doc.save(function(err, doc) {
    if (!test[2])
      assert(err || !doc, 'unexpected pass '+i + " while saving: " + doc);
    else {
      assert(!err && doc, 'unexpected fail ' + i + " while saving: " + err);
      if (prop) {
        assert(doc[prop] === true, 'prop not saved')
      }
    }
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
        assert.equal(Test.collection.collection.collectionName, "Test");
        assert(Test.check);
        assert(t.check);
        //test saveP() method
        var p = t.saveP().then(function(doc) {
          assert(doc);
          assert.instanceOf(doc, Test);
          Test.findOne(function(err,doc2) {
              assert.instanceOf(doc2, Test);
              done();
          });
        });
    });

     it('should make a model and instance without a schema', function(done) {
        var Test3 = createModel("Test3", {prop2: String});
        assert.equal(Test3.collection.collection.collectionName, "Test3");
        var t = new Test3();
        t.setPrinciple({roles:['admin']}); //test access control
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
            {prop3: String, prop4: String, ref: {type:String, ref:"Testbase"}},  Testbase);

        var base = new Testbase();
        base.saveP().then(function(basedoc){
          var derived = new Testd();
          derived.prop4 = "This is prop4";
          derived.ref = basedoc._id;
          derived.save(function() {
            Testbase.findOne({_id: base._id}, function(err, doc) {
              assert.instanceOf(doc, Testbase);
              //test that we can populate a derived ref that isn't present in base
              Testbase.find({}).populate('ref').exec(function(err,docs){
                var derivedseen = false;
                docs.forEach(function(doc2) {
                  if (doc2._id == derived._id) {
                    derivedseen = true;
                    assert.equal(doc2.prop4, "This is prop4");
                    assert.equal(doc2.ref._id, basedoc._id);
                    assert.instanceOf(doc2,Testd);
                  } else {
                    assert(!doc2.ref);
                  }
                });
                assert(derivedseen);
                done();
              });
            });
          });
      }).catch(done);
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

  it('should allow documents to dynamically change type', function(done) {
    var Test4 = createModel("Test4", {prop1: Boolean});
    var Test4Derive1 = createModel("Test4Derive1", {}, Test4);
    var Test4Derive2 = createModel("Test4Derive2", {}, Test4);
    var t3 = new Test4();
    var t3d1 = new Test4Derive1();
    var t3d2 = new Test4Derive2();
    Promise.all([t3.saveP(), t3d1.saveP(),t3d2.saveP()])
    .then(function() {
      return Test4.findById(t3.id).exec().then(function(doc){
        assert(doc); //base model finds base instance
      })
    })
    .then(function() {
      return Test4Derive1.findById(t3.id).exec().then(function(doc){
        assert(!doc); //1st derived model doesn't find base instance
      })
    })
    .then(function() {
      return Test4Derive1.findById(t3d1.id).exec().then(function(doc){
        assert(doc); //1st derived model finds 1st derived instance
      })
    })
    .then(function(){
      return Test4Derive2.findById(t3d1.id).exec().then(function(doc){
        assert(!doc); //2nd derived model doesn't finds 1st derived instance
      })
    })
    .then(function() {
      return Test4Derive1.update({_id: t3d1.id}, {$set: { __t: 'Test4Derive2' }}).exec();
    }) //test that type changed
    .then(function(result) {
      assert(result === 1);
      //no longer found here
      return Test4Derive1.findById(t3d1.id).exec().then(function(doc){
        assert(!doc); //1st derived model doesn't finds 1st derived instance anymore
      })
    })
    .then(function() {
      //now found here
      return Test4Derive2.findById(t3d1.id).exec().then(function(doc){
        assert(doc); //2nd derived model now finds 1st derived instance
      })
    })
    .then(done,done);
  });

  it('should expose createdOn property', function(done) {
    var Test = createModel("TestCreatedOn", s);
    var t = new Test();
    assert.equal(t.createdOn, null); //no id assigned yet
    var t2 = new Test();
    t2._id = '@Test@1'; //assign an id that not based on a ObjectId.
    assert.equal(t2.createdOn, null);
    var now = new Date();
    now.setMilliseconds(0); //ObjectId.getTimestamp() has second granuality
    t.saveP().then(function(doc) {
      assert(doc);
      assert.equal(t.createdOn.getTime(), now.getTime());
    }).then(done,done);
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

  it('should handle extending access control allowed', function(done) {
    var test = [{"create" : "admin"},
      "prop2", true]
    var schema = createModel.createSchema('testextendingallowed', {prop1: Boolean}, null, test[0]);
    schema.add({prop2: Boolean});
    schema.updateAccessControlMap({'write:prop2': 'user'});
    runAccessTest(test, schema.getModel(), ' extending allowed ', done);
  });

it('should handle extending access control denied', function(done) {
  var test = [{"create" : "user"},
    "prop2", false];
  var schema = createModel.createSchema('testextendingdenied', {prop1: Boolean}, null, test[0]);
  schema.add({prop2: Boolean});
  schema.updateAccessControlMap({'write:prop2': 'admin'});
  runAccessTest(test, schema.getModel(), ' extending denied ', done);
});

  it('should handle nested properties', function() {
    return; //XXX pending
    var subdoc = createModel.createSchema('subdoc', {arrayitem: Number});
    var model = createModel("TestAccessNested", {prop1:Boolean,
          nested: {
            nestedprop: Boolean
          },
          array: [subdoc]
        }, null, {"any"       : "admin",
                  "create"      : "user"}
        );

  var doc = new model();
  function sethook(next, key, val) {
    console.log('set hook', key, 'new:', val, 'old:', this[key]);
    next();
  }
  doc.pre('set', sethook);
  subdoc.pre('set', function sethook(next, key, val) {
    console.log('set hook subdoc', key, 'new:', val, 'old:', this[key]);
    next();
  });
  //note that this is never called
  subdoc.pre('markModified', function (next, key) {
    console.log('markmodified subdoc', key);
    next();
  });
  doc.setPrinciple(createModel.getAccessControlPolicy().defaultPrinciple || { roles:['user']});
  doc.nested.nestedprop = true;
  doc.array.push( { arrayitem: 1});
  doc.array[0].arrayitem = 'foo';
  doc.array = [{ arrayitem: 2}];
  doc.array[0].arrayitem = 'foo';
  doc.array.push( { arrayitem: 3});
  doc.array[1].arrayitem = 'foo';
  doc.nested = { nestedprop: false};
  });

  //XXX test Any/mixed
  //XXX test default values

}); // describe...
