var should = require('should')
  , assert = require('assert')
  , access = require('../lib/access');

describe('access', function(){
  it('should',  function(){
    
    var guard = new access.Guard({
       'view': 'user',
    });

    var user = {
      roles: [{name:'user', rights:['user']}]
    }

    var obj = {}
    var result = access.check('view', user, obj, guard);
    assert(result === true, typeof result)
    
    var result = access.check('edit', user, obj, guard);
    assert(result === undefined, typeof result);

  });
  
  it("should handle wildcard operations"); //{ '*': 'admin'}
  
  it('should detect invalid specifications', function() {
    [ {op: []} //bad role spec
    , {'op1|op2': '', 'op2':''} //duplicate op
    , {'op1|op1': ''} //duplicate op
    , {op:1}
    , {op: { 'bad rel': 'admin'}}
    , {op: { 'owner': 1}}
    , {op: { 'owner': {prop:'role'} }} //prop should have value map
    ].forEach(function(spec){
        assert.throws(
          function(){new access.Guard(spec);},
          function(err) { return err.name == 'InvalidAccessSpec';},
          JSON.stringify(spec))
    })
  });
});
