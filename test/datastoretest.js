var should = require('should')
  , assert = require('assert')
  , mongodb = require('mongodb')
  , datastore = require('../lib/datastore')
  , mongoose = require('mongoose');
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

 describe('.mongoose', function(){
    var Test1 = mongoose.model('Test1',
      new mongoose.Schema({
        __t: String,
         _id: String,
        prop1: []
        },{strict: false}) //'throw'
    );

    it('should connect',  function(done){
      mongoose.connect(config.dburl);
      var db = mongoose.connection;
//      db.on('error', console.error.bind(console, 'connection error:'));
      db.once('open', function() {
        //note!: model Test1 => namespace test1
        db.db.dropCollection('test1', function(err, result) {
          //may or may not exits, if it doesn't err will be set
          //console.log("dropCollection", err, result);
          done();
        });
      });
    });

    var ds = null;
    var lastid = null;
    it('should create a new doc',  function(done){
      ds = new datastore.MongooseDatastore();
      ds.create({
         prop1 : [], //XXX if property isn't defined in the schema this won't be saved
         __t: "Test1"
      }, function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert(doc._id, JSON.stringify(doc));
        lastid = doc._id;
        assert(Array.isArray(doc.prop1));
        done();
      });
    });

    it('should not create a doc with existing id',  function(done){
      //console.log('lastid', lastid);
      assert(ds);
      ds.create({
              _id: lastid,
              prop2: 'bad'
      }, function(err, doc) {
        assert(err && err.code == 11000); //duplicate key error
        assert(!doc);
        done();
      });
    });

     it('create with user-defined ids',  function(done){
      assert(ds);
      ds.create('{"_id": "@Test1@1","prop": "test"}', function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert.deepEqual(doc.toObject(), {"__v":0,"_id":"@Test1@1","prop":"test","prop1":[]});
        done();
      });
    });

    it('add a property',  function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        "prop-new": "another value",
        "prop1": ["added1", "added2"]
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.add(obj, function(err, doc) {
        assert(!err, JSON.stringify(err));
        obj['__v'] = 1;
        obj['__t'] = 'Test1';
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      });
    });

    it('removes properties and values', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        "prop-new": null,
        "prop1": "added1"
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.remove(obj, function(err, doc) {
        assert(!err, JSON.stringify(err));
        obj['__v'] = 2;
        obj['__t'] = 'Test1';
        delete obj['prop-new'];
        obj['prop1'] = ["added2"];
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      });
    });

    it('updates properties and values', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid,
        "prop-new2": "a new property",
        "prop1": 1 //replaced value
      };
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.update(obj, function(err, doc) {
        assert(!err, JSON.stringify(err));
        obj['__v'] = 3;
        obj['__t'] = 'Test1';
        obj['prop-new2'] =  "a new property";
        obj['prop1'] = [1];
        assert.deepEqual(doc.toObject(), obj);
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert.deepEqual(doc.toObject(), obj);
          done();
        });
      });
    });

    it('deletes objects', function(done){
      assert(ds);
      //console.log('lastid', lastid);
      var obj = {"_id": lastid};
      //console.log(obj); //{"_id": "@@5334d39164dd7bdb9e03cc7c","prop-new": "another value"}
      ds.destroy(obj, function(err, doc) {
        assert(!err, JSON.stringify(err));
        Test1.findOne({ _id: lastid}, function (err, doc) {
          assert(!err, JSON.stringify(err));
          assert(doc === null); //not found
          done();
        });
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
          [{"jsonrpc":"2.0","method":"create","params":{"_id":"@Test1@2","prop1":"adds a value to prop1"},"id":05968226976111071},{"jsonrpc":"2.0","method":"transaction_info","params":{"comment":"created $new05968226976111071"},"id": 49884485029342773}]
          )
        .expect('[{"jsonrpc":"2.0","id":5968226976111071,"result":{"__v":0,"_id":"@Test1@2","prop1":["adds a value to prop1"]}},{"jsonrpc":"2.0","id":49884485029342776,"result":{}}]', done);
      });

    });

 });

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
        assert(!err)
        assert(doc[0]._id, JSON.stringify(doc));
        lastid = doc[0]._id;
        assert(Array.isArray(doc[0].prop1));
        done();
      });
    });

    it('should not create a doc with existing id',  function(done){
      assert(ds);
      ds.create({
              _id: lastid,
              prop2: 'bad'
      }, function(err, doc) {
        assert(err && err.code == 11000); //duplicate key error
        assert(!doc);
        done();
      });
    });

    it('create with user-defined ids',  function(done){
      assert(ds);
      ds.create('{"_id": "@1","prop": "test"}', function(err, doc) {
        assert(!err, JSON.stringify(err));
        assert.deepEqual(doc, [{"_id":"@1","prop":"test"}]);
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
        assert(doc == 1); //1 object inserted
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
          [{"jsonrpc":"2.0","method":"create","params":{"_id":"@2","prop1":"adds a value to prop1"},"id":05968226976111071},{"jsonrpc":"2.0","method":"transaction_info","params":{"comment":"created $new05968226976111071"},"id": 49884485029342773}]
          )
        .expect('[{"jsonrpc":"2.0","id":5968226976111071,"result":[{"_id":"@2","prop1":"adds a value to prop1"}]},{"jsonrpc":"2.0","id":49884485029342776,"result":{}}]', done);
      });

    });

  });

});
