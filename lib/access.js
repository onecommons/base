var misc = require('./utils');
var pyPop = misc.pyPop;
var _ = require('underscore')
/*
Specify conditional mappings between operations and rights

operation: e.g. view, edit, create
optional: relationship between principle and object: e.g. owner, group
optional: state: a criteria on the object, e.g. status == 'draft'; visibility == "public"
=> required right

right_decl: '' | right | [right+]

relation_decl: {
 relation | '': right_decl
}

state_decl_inner: {
 'state.path' : { 'value': right_decl }
 |
 '' : right_decl //no matching state
}

state_decl: {
  relation_decl
  |
  relation | '': state_decl_inner
}

operation: right_decl | relation_decl | state_decl
*/
exports.Guard = Guard = function(operationAccessMap, strategy) {
  this.s = strategy || Strategy;
  this.map = {};
  for (var key in operationAccessMap) {
    var val = operationAccessMap[key];
    var ops = key.split('|');
    if (ops.length > 1) {
      for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        if (this.map[op] !== undefined)
          throw new InvalidAccessSpec(this, "duplicate operation specified");
        this.map[op] = val;
        this.check(op, {},{}); //validate
      }
    } else {
      if (this.map[key] !== undefined)
        throw new InvalidAccessSpec(this, "duplicate operation specified");
      this.map[key] = val;
      this.check(key, {},{}); //validate
    }
  }
};

function intersects(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (b.indexOf(a[i]) != -1)
      return true;
  }
  return false;
}

Guard.prototype = {

  _getRights: function(guard) {
      if (this.s.isRight(guard)) {
        return [guard];
      } else if (Array.isArray(guard)) {
        if (guard.length < 1)
          throw new InvalidAccessSpec(this, "empty rights array");
        return guard;
      } else {
        return undefined;
      }
  }
  
  ,_getAndCheckRights: function(principle, object, guard, rel) {
    var rights = this._getRights( guard );
    if (rights === undefined)
      throw new InvalidAccessSpec(this, "expected right"); //needs to be a right
    return this._checkRights(principle, object, rights, rel)
  }

  ,_checkRights: function(principle, object, rights, rel) {
     if (rights.indexOf('') != -1)
      return true;
     var userrights = this.s.getUserRights(principle, object, rel);
     //console.log('i', rights, userrights);
     return intersects(rights, userrights);
   }

  ,check: function(operation, principle, object) {
    var guard = this.map[operation] || this.map['*'];
    if (guard === undefined) {
      return undefined; //no rule
    }
    var rights = this._getRights(guard);
    if (rights !== undefined) {
      return this._checkRights(principle, object, rights);
    } 
    //guard specfies a relation
    matched = false;
    if (typeof guard !== 'object')
      throw new InvalidAccessSpec(this, "expected rel object");
    for (var rel in guard) {
      if (rel == '' || this.s.checkRelation(rel, principle, object)) {
        //has this relation, use it to check access
        var relguard = guard[rel];
        rights = this._getRights(relguard);
        if (rights !== undefined) {
          if (this._checkRights(principle, object, rights, rel))
            return true;
          if (rel == '') //mark the default case as matched
            matched = true;
          continue;
        }
        //it specfies a state
        if (!relguard || typeof relguard !== 'object')
          throw new InvalidAccessSpec(this, "expected state object");
        for (var key in relguard) {
          if (key == '') {
            matched = true;
            if (this._getAndCheckRights(principle, object, relguard[''], rel))
              return true;
            continue;
          }
          var values = relguard[key];
          if (!values || typeof values !== 'object')
            throw new InvalidAccessSpec(this, "expected state values map");
          for (var val in values) {
            if (this.s.checkState(object, key, val)) {
              matched = true;
              if (this._getAndCheckRights(principle, object, values[val], rel))
                return true;
            }
          }
        }
      }
    }
    if (matched) //guard covered this case but user didn't match
      return false;
    return undefined; //guard had nothing to say about this case
 }  

}

function check(op, user, obj) {
  var guards = Array.prototype.slice.call(arguments, 3);
  for (var i = 0; i < guards.length; i++) { 
    if (guards[i] == undefined)
      continue;
    var test = guards[i].check(op, user, obj);
    if (test !== undefined)
      return test;
  }
  return undefined;
}

function ensure() {
  var args = Array.prototype.slice.call(arguments,0);
  if (!check.apply(args) )
    throw new AccessDeniedError(args[0]);
}

var Strategy = {
  isRight: function(right) {
    return typeof right === 'string';
  }
  
  , getUserRights: function(user, object, rel) {
    //if (relation == 'group') 
    //only get the rights for the groups the user shares with the object
    //  return object.groups.map( (g) => findmembership(user, g).rights).flatten().unique()
    return _.uniq(_.flatten( (user.roles||[]).map(function(v) {return v.rights}) ) );
  }
  
  ,checkRelation: function(relation, user, object) {
    if (relation == 'owner')
      return user._id == object.owner;
    //else if (relation == 'group')
    //  return user.groups intersects object.groups;
    throw new InvalidAccessSpec(relation);
  }
  
  ,checkState: function (object, key, value) {
    if (value === undefined)
      throw new InvalidAccessSpec(key);
    return object[key] == value; //XXX support paths
  }
};

function InvalidAccessSpec(guard, message){
  this.name = InvalidAccessSpec.name;
  this.guard = guard;
  this.message = message || "";
}
InvalidAccessSpec.prototype = Error.prototype;
InvalidAccessSpec.name = 'InvalidAccessSpec';

function AccessDeniedError(message){
  this.name = AccessDeniedError.name;
  this.message = message || "";
}
AccessDeniedError.prototype = Error.prototype;
AccessDeniedError.name = 'AccessDeniedError';

exports.InvalidAccessSpec = InvalidAccessSpec;
exports.AccessDeniedError = AccessDeniedError;
exports.ensure = ensure;
exports.check = check;
