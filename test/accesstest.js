var should = require('should')
  , assert = require('assert')
  , access = require('../lib/access')
  , _ = require('underscore');

function assertAccessDenied(test, message){
  assert.throws(test,
    function(err) { return err.name == 'AccessDeniedError';},
    message);
}

function assertInvalidAccessSpec(test, message){
  assert.throws(test,
    function(err) { return err.name == 'InvalidAccessSpec';},
    message);
}

describe('access', function(){
  var makeRule = access.ruleFactory();
  function testspec(expected, user, obj, spec){
    //console.dir(spec);
    var result = access.check(user, obj, makeRule(spec));
    assert(result === expected, expected + '!==' + result + ' ' + typeof result);
  }

var obj = {
  'owner': 1
};

  it('should handle simple rules',  function(){
    var user = {
      roles: [{name:'user', guards:['user']}]
    };

    [
    'user',
    ['foo', 'user'],
    ['foo', ''],
    '',
    ['']
    ].forEach(_.partial(testspec, true, user, obj));

    [
    'foo',
    ['foo'],
    ].forEach(_.partial(testspec, false, user, obj));
});

it('should handle rules with relationships',  function(){
   [
   [1, 'user', true],
   [1, 'guest', false],
   [2, 'user', undefined],
   [2, 'guest', undefined],
   ].forEach(function(params){
     testspec(params[2], {
       id: params[0],
       roles:[ {guards:[ params[1] ]} ]
     }, obj, {'owner': 'user'});
   });

  [
  [1, 'user', true],
  [1, 'guest', false],
  [1, 'foo', false],
  [2, 'user', false],
  [2, 'guest', false],
  [2, 'foo', true],
  ].forEach(function(params){
    testspec(params[2], {
      id: params[0],
      roles:[ {guards:[ params[1] ]} ]
    }, obj,
    {'owner': 'user',
      '': 'foo'
    });
  });

});

it('should handle rules with relationships and states',  function(){
    [
    [1, 'user', 'public', true],
    [1, 'guest', 'public', false],
    [2, 'user', 'public', true],
    [2, 'guest', 'public', true],
    [1, 'user', 'private', true],
    [1, 'guest', 'private', false],
    [2, 'user', 'private', undefined],
    [2, 'guest', 'private', undefined],
    ].forEach(function(params){
      testspec(params[3], {
        id: params[0],
        roles:[ {guards:[ params[1] ]} ]
      }, {
        owner: 1,
        visibility: params[2]
      },
      {'owner': 'user', //owner relation
        '': { //any other relation
        'visibility': {'public': ''} //if visibilty = public, no role required (open)
         }
      });
    });

});

it('should handle rules with relationships and states and defaults',  function(){

    [
    [1, 'user', 'public', true],
    [1, 'guest', 'public', false],
    [2, 'user', 'public', true],
    [2, 'guest', 'public', true],
    [1, 'user', 'private', true],
    [1, 'guest', 'private', false],
    [2, 'user', 'private', false],
    [2, 'guest', 'private', false],
    [2, 'admin', 'private', true],
    ].forEach(function(params){
      testspec(params[3], {
        id: params[0],
        roles:[ {guards:[ params[1] ]} ]
      }, {
        owner: 1,
        visibility: params[2]
      },
      {'owner': 'user', //owner relation
        '': { //any other relation
        'visibility': {'public': ''}, //if visibilty = public, no role required (open)
        '' : 'admin'  //no matching state
         }
      });
    });

});

it('should handle rules with relationships and states and overrides',  function(){

    [
    [1, 'user', 'normal', true],
    [1, 'guest', 'normal', false],
    [1, 'user', 'secret', false],
    [1, 'admin', 'secret', true],
    [2, 'user', 'private', undefined],
    [2, 'admin', 'private', undefined],
    ].forEach(function(params){
      testspec(params[3], {
        id: params[0],
        roles:[ {guards:[ params[1] ]} ]
      }, {
        owner: 1,
        sensitivity: params[2]
      },
      //override owner guard if is sensitivity is set to "secret"
      {'owner':  {
        'sensitivity': {'secret': 'admin'},
        '' : 'user'
         }
      });
    });

  });

  it('should check multiple relations but not default if one of them applies');
  //XXX e.g. {'' : '', 'rel1': 'admin', 'rel2': 'admin'} => denied

  it('should detect invalid specifications', function() {
    [ {op: []} //bad role spec
    , {'op1|op2': '', 'op2':''} //duplicate op
    , {'op1|op1': ''} //duplicate op
    , {op:1}
    //, {op: { 'bad rel': 'admin'}} //now its valid
    , {op: { 'owner': 1}}
    , {op: { 'owner': {prop:'role'} }} //prop should have value map
    ].forEach(function(spec){
      assertInvalidAccessSpec(
          function(){ access.makeMap(spec, makeRule);},
          JSON.stringify(spec));
    })
  });

  it('first multiple rules should the first that applies', function() {
    var T = makeRule(''), F = makeRule("admin"),
      U = makeRule({ owner: 'user' });

    var test = [
      [U], undefined,
      [T], true,
      [F], false,
      [U, U], undefined,
      [U, T], true,
      [U, F], false,
      [F, T], false,
      [T, F], true
    ];

    var user = { id: 2,
      roles:[ {guards:[ 'user' ]} ]
    };
    for (var i=0; i< test.length;i+=2) {
      var args = test[i], expected = test[i+1];
      var result = access.check(user, obj, args);
      assert(result === expected, i + ' ' + expected + '!==' + result + ' ' + typeof result);
      result = access.check.apply(null, [user, obj].concat(args));
      assert(result === expected, i + ' ' + expected + '!==' + result + ' ' + typeof result);
      if (expected) {
        assert(access.ensure(user, obj, args));
        assert(access.ensure.apply(null, [user, obj].concat(args)));
      } else {
        assertAccessDenied(function() {access.ensure(user, obj, args); });
        assertAccessDenied(function() {
            access.ensure.apply(null, [user, obj].concat(args));
        });
      }
    }
 });

it('should rules matches type overrides even if the override rule do not apply', function() {
  var policy = new access.Policy({
    'any': undefined,
    'read': 'any',
    'write': 'any',
    'edit':'write',
    'create':'write',
    'remove': 'write',
    'view': 'read',
  });

  //createChecker(operations, accesscontrolmap) => checker
  //createCheckerFactory(operations) => checkerFactory
  //checkerFactory(accesscontrolmap) => checker
  //checker.check(op, [qualifier], user, obj) //test omitting qualifier
  //checker.getRules(op, qualifier)
  //checker.ensure(op, [qualifier], user, obj)

  var checker = access.createChecker([{
    'create|remove':'user',
    'create:prop1':'',
  }, {
    'any': 'admin',
    'create:prop1':'admin',
  }], policy);
  //console.dir(checker.accessControlMap);
  /*
   assert.deepEqual(checker.accessControlMap, access.makeMap({
    'any': 'admin',
    'create':'user',
    'remove':'user',
    'create:prop1':'', //XXX test nullguard
  }, makeRule));
  */
  var user = { id: 1,
    roles:[ {guards:[ 'user' ]} ]
  };

  assertInvalidAccessSpec(function() {
      checker.check('missing', user, obj)
  });

  assert(checker.getRules('create').length == 2);
  assert(checker.getRules('create:prop1').length == 1);

  //derived, base are merged
  //so if the base's rule applies and derived didn't the base is still ignored

  //however that is not true for
  //op:qual, baseop:qual, op, baseop

});

//but rules do apply for property and operation overrides


});
