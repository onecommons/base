// db_tests.js
// executed from browser.

function verifyQuery(query, expected, done) {
  var errormsg = 'unexpected result for query: ' + JSON.stringify(query);
  $(document).dbQuery(query,
   function(data, error) {
      //console.log("results for query", JSON.stringify(query), "got", JSON.stringify(data), " expected ", JSON.stringify(expected));
      assert(!error, 'unexpected error for query:' + JSON.stringify(error));
      assert(Array.isArray(data), errormsg + " expected an array, got " + JSON.stringify(data));
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
        assert.equal(pjson1.prop1, resp.prop1, JSON.stringify(resp));
        assert.equal(pjson1._id, resp._id);
        verifyQuery({_id: pjson1._id}, expected, done);
      });
  });

 it('should fail to create the same object twice', function(done) {
   var createCallbackCalled = 0;
   var commitEventCalled = 0;

   $(document).one('dbdata', function(event, response, request) {
     assert(event.type == 'dbdata', event.type);
     assert(response.hasErrors() === true, response.hasErrors());
     assert(Array.isArray(response), response);
     assert(response[0].error);
     assert(response[0].error.code == -32001, response[0].error.code);

     assert(createCallbackCalled === 1, 'createCallbackCalled:' + createCallbackCalled);
     assert(commitEventCalled === 0, 'commitEventCalled:' + commitEventCalled);
     ++commitEventCalled;
     done();
   });

    $(document).dbCreate(pjson1, function(doc, err) {
      assert(!doc && err);
      assert(err.code == -32001);
      assert(commitEventCalled === 0, 'commitEventCalled:' + commitEventCalled);
      assert(createCallbackCalled === 0, 'createCallbackCalled:' + createCallbackCalled);
      ++createCallbackCalled;
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
      $(document).dbUpdate(mod, function(resp, err) {
          assert(resp && !err, "expected resp && !err");
          assert.deepEqual(mod.prop1, resp.prop1);
          verifyQuery({_id: pjson1._id}, expected, done);
      });
  });

  it('should do client-side rollback', function(done) {
      //test dbdata custom event, should only be called once per transaction
      //callbacks should fire in this order: dbUpdate, dbRollback, dbdata event
      var updateCallbackCalled = 0; //should be called first
      var rollbackCallbackCalled = 0; //second
      var rollbackEventCalled = 0;  //third

      $(document).one('dbdata', function(event, response, request) {
        ++rollbackEventCalled;
        assert(event.type == 'dbdata',"expected event.type == 'dbdata'");
        assert(response.hasErrors() === true, "expected response.hasErrors() === true");
        assert(response.error && response.error.code == -32001, "expected response.error.code == -32001")
        assert(updateCallbackCalled === 1, "updateCallbackCalled should have been called");
        assert(rollbackCallbackCalled === 1, "rollbackCallbackCalled should have been called");
        assert(rollbackEventCalled === 1, "custom trigger should have only been called once");
      });
      var mod = pjson1;
      mod.prop1 = ['whatever'];
      $(document).dbBegin().dbUpdate(mod, function(resp, err) {
        assert(!resp && err, "expected !resp && err");
        assert(err.code == -32001, "expected err.code == -32001"); //client-side rollback
        updateCallbackCalled++;
        assert(rollbackCallbackCalled === 0, "commit callback should not have been called yet");
        assert(rollbackEventCalled === 0, "custom trigger should not have been called yet");
        assert(updateCallbackCalled === 1, "db callback should have only been called once");

        verifyQuery({_id: pjson1._id}, expected, function() {
          assert(updateCallbackCalled === 1, "updateCallbackCalled should have been called");
          assert(rollbackCallbackCalled === 1, "rollbackCallbackCalled should have been called");
          assert(rollbackEventCalled === 1, "rollback event should have only been called once not " + rollbackEventCalled);
          done();
        });
      }).dbRollback(function(response, requests) {
        assert(response.hasErrors() === true, "dbRollback expected response.hasErrors() === true");
        rollbackCallbackCalled++;
        assert(updateCallbackCalled === 1, "dbCallback should have been called");
        assert(rollbackEventCalled === 0, "custom trigger should not have been called yet");
        assert(rollbackCallbackCalled === 1, "commit callback should have only been called once");
      });
  });

  it('should delete an object', function(done) {
      $(document).dbDestroy(pjson1, function(resp, err) {
        assert(resp && !err);
        assert.deepEqual(resp, {"_id":"@DbTest1@1","prop1":[], __t:"DbTest1"});
        verifyQuery({_id: pjson1._id}, [], done);
      });
  });

it("should invoke callbacks and triggers in the correct order", function(done){
  //test dbdata custom event, should only be called once per transaction
  //callbacks should fire in this order: dbQuery, dbCommit, dbdata event
  var dbCallbackCalled = 0; //should be called first
  var commitCallbackCalled = 0; //second
  var customTriggerCalled = 0;  //third

  var customTriggerFunc = function(event, data) {
    customTriggerCalled++;
    assert(event.type == 'dbdata',"expected event.type == 'dbdata'");
    assert(data.hasErrors() === false, "expected data.hasErrors() === false");
    assert(dbCallbackCalled === 1, "dbCallback should have been called");
    assert(commitCallbackCalled === 1, "commitCallback should have been called");
    assert(customTriggerCalled === 1, "custom trigger should have only been called once");
    done();
  }
  $(document).bind('dbdata', customTriggerFunc);

  $(document).dbBegin().dbQuery({__t:"DbTest1"},
     function(data, err) {
        assert(data && !err, "expected data && !err");
        assert(Array.isArray(data) && data.length === 0, "expected Array.isArray(data) && data.length === 0, not " + JSON.stringify(data));
        dbCallbackCalled++;
        assert(commitCallbackCalled === 0, "commit callback should not have been called yet");
        assert(customTriggerCalled === 0, "custom trigger should not have been called yet");
        assert(dbCallbackCalled === 1, "db callback should have only been called once");
    }).dbCommit(function(response) {
      assert(response.hasErrors() === false, "expected response.hasErrors() === false");
      commitCallbackCalled++;
      assert(dbCallbackCalled === 1, "dbCallback should have been called");
      assert(customTriggerCalled === 0, "custom trigger should not have been called yet");
      assert(commitCallbackCalled === 1, "commit callback should have only been called once");
  });
});

it("should allow callback to stop event propagation", function(done){
  $(document).dbQuery({__t:"DbTest1"},
   function(data, err) {
     // should not call customTriggerFunc
     setTimeout(done, 10);
     return false;
  });
});

});
