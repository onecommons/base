var should = require('should')
  , assert = require('assert')
  , access = require('../lib/access')
  , _ = require('underscore');

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

//XXX test more than one matching relation

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
          function(){ access.makeMap(spec, makeRule);},
          function(err) { return err.name == 'InvalidAccessSpec';},
          JSON.stringify(spec))
    })
  });
});
