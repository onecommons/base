// db_tests.js
// executed from browser.

function verifyQuery(query, expected, done) {
  var errormsg = 'unexpected result for query: ' + JSON.stringify(query);
  $(document).dbQuery(query,
   function(data) {
      //console.log("results for query", JSON.stringify(query), "got", JSON.stringify(data), " expected ", JSON.stringify(expected));
      assert(data.error === undefined, 'unexpected error for query:' + JSON.stringify(data.error));
      assert(Array.isArray(data), errormsg + " expected an array");
      //javascript doesn't provide an easy way to do deep equality on objects,
      //so instead we'll compare JSON strings of objects
      assert.deepEqual(data, expected, errormsg + " got " + JSON.stringify(data) + ' expected ' + JSON.stringify(expected));
      done();
  });
}

describe('db_tests', function() {

  $.db.url = '/datarequest';
  var pjson1 = {
       _id : '@DbTest1@1',
       __t: 'DbTest1',
       prop1 : '1 prop1 val'
  };

  it('should do dbCreate', function(done) {
      var expected = [{
       _id : '@DbTest1@1',
       __t: 'DbTest1',
       __v: 0,
       prop1 : ['1 prop1 val']
      }];

      $(document).dbCreate(pjson1, function(resp) {
        // console.log("RESPONSE:", JSON.stringify(resp));
        assert.equal(pjson1.prop1, resp.prop1, JSON.stringify(resp));
        assert.equal(pjson1._id, resp._id);
        verifyQuery({_id: pjson1._id}, expected, done);
      });
  });

  var modifiedprop = ["modified property value"]
  var expected = [{
   _id : '@DbTest1@1',
   __t: 'DbTest1',
   __v: 1,
   prop1 : modifiedprop
  }];

  it('should do one dbUpdate', function(done) {
      var mod = pjson1;
      mod.prop1 = modifiedprop;
      $(document).dbUpdate(mod, function(resp) {
          assert.deepEqual(mod.prop1, resp.prop1);
          verifyQuery({_id: pjson1._id}, expected, done);
      });
  });

  it('should do client-side rollback', function(done) {
      var mod = pjson1;
      mod.prop1 = ['whatever'];
      $(document).dbBegin().dbUpdate(mod, function(resp) {
        //console.log('client-side rollback', JSON.stringify(resp));
        verifyQuery({_id: pjson1._id}, expected, done);
      }).dbRollback();
  });

  it('should delete an object', function(done) {
      $(document).dbDestroy([pjson1._id], function(resp) {
        assert.deepEqual(resp, {"_id":"@DbTest1@1","prop1":[]});
        verifyQuery({_id: pjson1._id}, [], done);
      });
  });

it("should invoke callbacks and triggers in the correct order", function(done){
  //test dbdata custom event, should only be called once per transaction
  var dbCallbackCalled = 0; //should be called first
  var commitCallbackCalled = 0; //second
  var customTriggerCalled = 0;  //third

  var customTriggerFunc = function(event, data) {
    customTriggerCalled++;
    assert(dbCallbackCalled === 1, "dbCallback should have been called");
    assert(commitCallbackCalled === 1, "commitCallback should have been called");
    assert(customTriggerCalled === 1, "custom trigger should have only been called once");
    done();
  }
  $(document).bind('dbdata-*', customTriggerFunc);

  //make sure commit worked and dbQuery callback was called after dbCreate callback
  //note: query will respond with an error because no _id or __t is in the query condition
  $(document).dbBegin().dbQuery({},
     function(data) {
        dbCallbackCalled++;
        assert(commitCallbackCalled === 0, "commit callback should not have been called yet");
        assert(customTriggerCalled === 0, "custom trigger should not have been called yet");
        assert(dbCallbackCalled === 1, "db callback should have only been called once");
    }).dbCommit(function(event, response) {
      commitCallbackCalled++;
      assert(dbCallbackCalled === 1, "dbCallback should have been called");
      assert(customTriggerCalled === 0, "custom trigger should not have been called yet");
      assert(commitCallbackCalled === 1, "commit callback should have only been called once");
  });
});

});
