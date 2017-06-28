//var path = require('path');
//global.MONGOOSE_DRIVER_PATH = path.resolve(path.join(__dirname, 'lib/mongoose-debug-driver/'));
var should = require('should')
  , assert = require('assert')
  , mongodb = require('mongodb')
  , datastore = require('../lib/datastore')
  , mongoose = require('mongoose')
  , createModel = require('../lib/createmodel');
var DBRef = mongodb.DBRef, ObjectID = mongodb.ObjectID;
var config = require('../lib/config')()('app');

describe('datastore', function(){

  after(function(done){
    var db = mongoose.connection;
     db.db.dropCollection('test1', function(err, result) {
        //may or may not exits, if it doesn't err will be set
        //console.log("dropCollection", err, result);
        done();
      });

  });

  describe('.pJSON', function(){

  it('should escape strings that look like objectids',  function(){
    var obj1  = {k:ObjectID("530936daf48be9095b414c52"), l:'@@escaped'};
    var json1 = datastore.pJSON.stringify(obj1);
    //console.log(obj1.k.constructor, obj1.k);
    json1.should.equal('{"k":"@@530936daf48be9095b414c52","l":"::@@escaped"}');
    assert.deepEqual(obj1.k, ObjectID("530936daf48be9095b414c52"), 'obj1 shouldnt have been mutated');
    var result1 = datastore.pJSON.parse(json1);
    assert.deepEqual(result1, obj1);

    //try in an array
    var obj2 = [ObjectID("530936daf48be9095b414c52"), '@@escaped'];
    var json2 = datastore.pJSON.stringify(obj2);
    json2.should.equal('["@@530936daf48be9095b414c52","::@@escaped"]');
    assert.deepEqual(obj2[0],ObjectID("530936daf48be9095b414c52"), 'obj2 shouldnt have been mutated');
    var result2 = datastore.pJSON.parse(json2);
    assert.deepEqual(result2, obj2);
  });

  it('should handle user-defined strings as _ids',  function(){
    var json3 = '{"_id":"@1","prop":"test"}'; //user-defined id
    var obj3 = datastore.pJSON.parse(json3);
    var result3 = datastore.pJSON.stringify(obj3);
    assert.deepEqual(result3, json3);

    var json4 = '{"_id":"@Test1@533cddd1ef93f6001ecf70fb"}'; //user-defined id
    var obj4 = datastore.pJSON.parse(json4);
    var result4 = datastore.pJSON.stringify(obj4);
    assert.deepEqual(result4, json4);
  });

 });

 function makeTests(modelName, principle) {
  return function(){
    var expectAccessDenied = principle && !principle.roles;
    function checkAccessDenied(cb, done) {
      return function(err, doc) {
        if (expectAccessDenied) {
          assert(err && err.name == 'AccessDeniedError', "expected AccessDeniedError, not " + err);
          done();
        } else {
          cb(err, doc);
        }
      }
    }

    var testid = "@"+ modelName + "@1";
    var Test1 = createModel(modelName,
      new mongoose.Schema({
        __t: String,
         _id: String,
        prop1: [],
        nested: {
          foo: String
        }
      },{strict: false, //'throw'
        toJSON: {getters:false}
      })
    );

    it('should connect',  function(done){
      mongoose.connect(config.dburl);
      var db = mongoose.connection;
//      db.on('error', console.error.bind(console, 'connection error:'));
      db.once('open', function() {
        db.db.dropCollection(Test1.collection.collection.collectionName, function(err, result) {
          //may or may not exits, if it doesn't err will be set
          //console.log("dropCollection", err, result);
          done();
        });
      });
    });

    after(function(done) {
      mongoose.connection.db.dropCollection(Test1.collection.collection.collectionName, function(err, result) {
        mongoose.connection.close(done);
      });
    });

    var ds = null;
    var lastid = null;
    it('should create a new doc',  function(done){
      ds = new datastore.MongooseDatastore();
      ds.create({
         prop1 : [], //XXX if property isn't defined in the schema this won't be saved
         __t: modelName
      }, checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert(doc._id, JSON.stringify(doc));
        lastid = doc._id;
        assert(Array.isArray(doc.prop1));
        done();
      }, function() {
        //if access denied we need to create the object for the rest of the tests
        ds.create({
           prop1 : [],
           __t: modelName
        }, function(err, doc) {
          assert(!err && doc && doc._id);
          lastid = doc._id;
          done();
        })
      }), principle);
    });

    it('should not create a doc with existing id',  function(done){
      //console.log('lastid', lastid);
      assert(ds);
      ds.create({
              _id: lastid,
              prop2: 'bad'
      }, checkAccessDenied(function(err, doc) {
        assert(err && err.code == 11000); //duplicate key error
        assert(!doc);
        done();
      }, done), principle);
    });

     it('create with user-defined ids',  function(done){
      assert(ds);
      ds.create('{"_id": "'+ testid + '","prop": "test"}', checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert.deepEqual(doc.toObject(), {"__v":0,"_id":testid,"prop":"test","prop1":[],"__t":modelName});
        done();
      },done), principle); //XXX security hole!!
    });

    it('add a property',  function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        "prop-new": "another value",
        "prop1": ["added1", "added2"]
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.add(obj, checkAccessDenied(function(err, doc) {
        assert(!err, err);
        obj['__v'] = 1;
        obj['__t'] = modelName;
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      }, done), principle);
    });

    it('removes properties and values', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        "prop-new": null,
        "prop1": "added1"
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.remove(obj, checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        obj['__v'] = 2;
        obj['__t'] = modelName;
        delete obj['prop-new'];
        obj['prop1'] = ["added2"];
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      },done), principle);
    });

    it('updates properties and values', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        "prop-new2": "a new property",
        "prop1": 1 //replaced value
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.update(obj, checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        obj['__v'] = 3;
        obj['__t'] = modelName;
        obj['prop-new2'] =  "a new property";
        obj['prop1'] = [1];
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      }, done), principle);
    });

    it('replaces the object', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        "prop-new3": "another new property",
        "prop1": 3, //replaced value
        nested: {
          foo: 1
        }
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.replace(obj, checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        obj['__v'] = 4;
        obj['__t'] = modelName;
        // change because it was coerced into an array:
        obj['prop1'] = [3];
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      }, done), principle);
    });

    it('updates nested objects', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        nested: {
          bar: 2
        }
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.update(obj, checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        obj['__v'] = 4;
        obj['__t'] = modelName;
        // add the properties from the previous test:
        obj['prop-new3'] =  "another new property";
        obj['prop1'] = [3];
        obj.nested.foo = 1;
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      }, done), principle);
    });

    it('queries', function(done){
      ds.query({conditions:{__t:modelName}}, checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert(doc && doc.length == 2);
        done();
      }, done), principle);
    });

    it('queries with conditions', function(done){
      //note: no checkAccessDenied() here because empty results will not have any checks done
      ds.query({conditions:{missing:0, __t:modelName}}, function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert(doc && doc.length == 0);
        done();
      }, principle);
    });

    it('deletes objects', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid};
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.destroy(obj, checkAccessDenied(function(err, doc) {
        assert(!err, JSON.stringify(err));
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert(!err, JSON.stringify(err));
          assert(doc === null); //not found
          done();
        });
      }, done), principle);
    });

    describe('.jsonrpc', function(){
      var express = require('express')
       , request = require('supertest')
       , jsonrpc = require('../lib/jsonrpc');
      var bodyParser = require('body-parser');

      var app = null;
      before(function(done) {
        app = express();
        app.use(bodyParser.json({reviver: datastore.pJSON.reviver}));
        assert(ds);
        app.post('/', jsonrpc.router.bind(new datastore.RequestHandler(ds)));
        done();
      });

      it('should create objects', function(done){
        var id = "@"+modelName+"@2";
        assert(app);
        request(app)
        .post('/')
        //.set('Content-Type', 'application/json') //unnecessary since its the default
        .send(
          [{"jsonrpc":"2.0","method":"create","params":{"_id":id,"prop1":"adds a value to prop1"},"id":5968226976111071},{"jsonrpc":"2.0","method":"transaction_info","params":{"comment":"created $new05968226976111071"},"id": 49884485029342773}]
          )
        .expect('[{"jsonrpc":"2.0","id":5968226976111071,"result":{"__v":0,"_id":"@Test1@2","prop1":["adds a value to prop1"],"__t":"Test1"}},{"jsonrpc":"2.0","id":49884485029342776,"result":{}}]'
            .replace(/Test1/g, modelName), done);
      });

    });
  };
}; //makeTests

describe('.mongoose', makeTests("Test1", null));
describe('.mongoose access denied', makeTests("Test1d", {}));
describe('.mongoose access allowed', makeTests("Test1a", {roles:['admin']}));

 describe('.mongodb', function(){
    var testdb = null;

    after(function() {
      if (testdb)
        testdb.close();
    });

    it('should connect',  function(done){
       mongodb.MongoClient.connect(config.dburl, function(err, db) {
       if(err) throw err;
       testdb = db;
       db.dropCollection('unittests', function(err, result) {
          //may or may not exits, if it doesn't err will be set
          done();
       });
      });
    });

    it('should have an empty collection', function(done) {
      assert(testdb);
      testdb.collection('unittests').count(function(err, count) {
        assert(!err);
        assert(count == 0);
        done();
      });
    });

    var ds = null;
    var lastid = null;
    it('should create a new doc',  function(done){
      var collection = testdb.collection('unittests');
      ds = new datastore.MongoRawDatastore(collection);

      ds.create({
         prop1 : []
      }, function(err, doc) {
        assert(!err);
        assert(doc._id, JSON.stringify(doc));
        lastid = doc._id;
        assert(Array.isArray(doc.prop1));
        done();
      });
    });

    it('should not create a doc with existing id',  function(done){
      assert(ds);
      ds.create({
              _id: lastid,
              prop2: 'bad'
      }, function(err, doc) {
        assert(err && err.code == 11000, err); //duplicate key error
        // XXX newer versions of mongo return BulkWriteResult
        //assert(!doc, doc);
        done();
      });
    });

    it('create with user-defined ids',  function(done){
      assert(ds);
      ds.create('{"_id": "@1","prop": "test"}', function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert.deepEqual(doc, {"_id":"@1","prop":"test"}, doc);
        done();
      });
    });

//     Uncaught AssertionError: {"name":"MongoError","err":"Cannot apply $addToSet modifier to non-array","code":12591,"n":0,"connectionId":338,"ok":1}
    it('add a property',  function(done){
      assert(ds);
      var obj = '{"_id": "@@' + lastid + '","prop-new": "another value"}';
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.add(obj, function(err, doc) {
        assert(!err, JSON.stringify(err));
        //console.log(JSON.stringify(doc));
        //XXX newer versions of mongo don't return the updated object
        // assert(doc == 1, doc); //1 object inserted
        //XXX query and test for property value
        done();
      });
    });

    describe('.jsonrpc', function(){
      var express = require('express')
       , request = require('supertest')
       , jsonrpc = require('../lib/jsonrpc');
      var bodyParser = require('body-parser');
      var app = null;
      before(function(done) {
        app = express();
        app.use(bodyParser.json({reviver: datastore.pJSON.reviver}));
        assert(ds);
        app.post('/', jsonrpc.router.bind(new datastore.RequestHandler(ds)));
        done();
      });

      it('should create objects', function(done){
        assert(app);
        request(app)
        .post('/')
        //.set('Content-Type', 'application/json') //unnecessary since its the default
        .send(
          [{"jsonrpc":"2.0","method":"create","params":{"_id":"@2","prop1":"adds a value to prop1"},"id":5968226976111071},{"jsonrpc":"2.0","method":"transaction_info","params":{"comment":"created $new05968226976111071"},"id": 49884485029342773}]
          )
        .expect('[{"jsonrpc":"2.0","id":5968226976111071,"result":{"_id":"@2","prop1":"adds a value to prop1"}},{"jsonrpc":"2.0","id":49884485029342776,"result":{}}]', done);
      });

    });

  });

});
