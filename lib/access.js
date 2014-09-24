var misc = require('./utils');
var pyPop = misc.pyPop;
var _ = require('underscore')
/*
This module implements an abstract model access control operations and objects.
The rule specifies whether a principle
The second is an api for associating operations with rules.

Rule: given a principle and object specify what permissions are needed

if the rule applies return whether or not the user has the right
if the rule doesn't apply, check the next rule


rule for property and op
rule for property, any op
rule for object type and op
rule for object type any op
rule for any type and op
rule for any type and any op

the check will pass even if a rule with lower precedence is more restrictive
if instead of 'any' op, ops had subtypes the potential problems are greatly mitigated
as exceptional ops can have a unique base type.

now its just:
rule for property and op (find rule with closet op)
rule for object type and op
rule for any type and op

check(map[prop][op], map[prop]['*'], map[type][op], map[type][op][*], map['*'][op], map['*']['*'])
vs.
check(map[prop][op] || map[prop][op.base], map[type][op] || map[type][op.base], map['*'][op] || map['*'][op.base])

Rule.getGuards(principle, object)
Rule.check(principle, object)

check(principle, object, rule...)

AccessMap.lookup(op): Rule


A Guard describes the "rights" a principle needs for a given "operation" on an object.
Each rule can optionally specify conditions for that rule to apply:
A relationship between the object and the principle required
(e.g. owner) and/or a state criteria on the object, e.g. status == 'draft'; visibility == "public"

{
dataobjectbase: G,
type: { '*': G,
   prop: G
 },
}

{
dataobjectbase: {'*': G},
type: { '*': { v: G, e: G},
   prop: { v: G,}
 },
}




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
function ruleFactory(strategy) {
  var s = _.defaults({}, strategy || {}, Strategy);

  function _getGuards(spec) {
    if (Array.isArray(spec)) {
      if (spec.length < 1)
        throw new InvalidAccessSpec(spec, "empty guard array");
      return spec.map(s.getGuard, s);
    } else {
      var guard = s.getGuard(spec);
      if (guard !== undefined) {
        return [guard];
      } else {
        return undefined;
      }
    }
  }

function _getAndCheckGuards(principle, object, spec, rel) {
  var guards = _getGuards(spec);
  if (guards === undefined)
    throw new InvalidAccessSpec(spec, "expected guard(s)"); //needs to be a guard
  return _checkGuards(principle, object, guards, rel);
}

  function _checkGuards(principle, object, guards, rel) {
    if (guards.indexOf(s.nullGuard) != -1)
      return true;
    return s.userHasGuards(principle, object, rel, guards);
  }

  function _checkRel(rel, principle, object, relspec) {
    //has this relation, use it to check access
    var guards = _getGuards(relspec);
    if (guards !== undefined) {
      return _checkGuards(principle, object, guards, rel);
    }
    //else relspec specfies a state
    if (!relspec || typeof relspec !== 'object')
      throw new InvalidAccessSpec(relspec, "expected state object");

    for (var key in relspec) {
      if (key == '') {
        continue;
      }
      var values = relspec[key];
      if (!values || typeof values !== 'object')
        throw new InvalidAccessSpec(values, "expected state values map");
      for (var val in values) {
        if (s.checkState(object, key, val)) {
          return _getAndCheckGuards(principle, object, values[val], rel)
          //console.log('state', key, val, values[val]);
        }
      }
    }
    if (relspec['']) {
      return _getAndCheckGuards(principle, object, relspec[''], rel);
    }
    return undefined;
  }

  return function(spec) {
    var rule = {
      check: function(principle, object) {
        var guards = _getGuards(spec);
        if (guards !== undefined) {
          //the spec is just guards
          return _checkGuards(principle, object, guards, rel);
        }
        //else the spec specfies a relation
        if (typeof spec !== 'object')
          throw new InvalidAccessSpec(spec, "expected rel object");

        var matched = false;
        for (var rel in spec) {
          if (rel == '')
            continue;
          if (s.checkRelation(rel, principle, object)) {
            var checked = _checkRel(rel, principle, object, spec[rel]);
            if (checked)
              return true;
            else if (check !== undefined)
              matched = true;
          }
        }
        if (!matched && spec[''])
          return _checkRel(rel, principle, object, spec['']);

        if (matched) //a spec covered this case but user didn't match
          return false;
        return undefined; //rule had nothing to say about this case
      },
      ensure: function(principle, object) {
        if (!this.check(principle, object))
          throw new AccessDeniedError(this); //denied or no rule applied
        return true;
      }
    };

    rule.check(spec, {},{}); //validate
    return rule;
  }
};

function intersects(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (b.indexOf(a[i]) != -1)
      return true;
  }
  return false;
}

var Strategy = {
  nullGuard: '',

  getGuard: function(guard) {
    return typeof guard === 'string' ? guard : undefined;
  },

  userHasGuards: function(user, object, rel, guards) {
    function getRoles(user) {
      return user.roles || [];
    }

    //if (relation == 'group')
    //only get the rights for the groups the user shares with the object
    //  return _.chain(object.groups).map( (g) => findmembership(user, g).rights).flatten().unique()

    var userguards = _.chain(getRoles(user)).map(function(v) {return v.guards}).flatten().uniq().value();
    return intersects(guards, userguards);
  },

  checkRelation: function(relation, user, object) {
    return user.id == object[relation];
    //if (relation == 'owner')
    //  return user.id == object.owner;
    //else if (relation == 'group')
    //  return user.groups intersects object.groups;
    //throw new InvalidAccessSpec(relation);
  },

  checkState: function (object, key, value) {
    if (value === undefined)
      throw new InvalidAccessSpec(this, 'unknown state: ' + key);
    return object[key] == value; //XXX support paths
  }
};

function makeOps(ops) {
  var operations = {};

  for (var op in ops) {
    operations[op] = (typeof op === 'string') ?
        { name: op } : op;
  }
  for (var op in ops) {
    var obj = operations[op];
    var base = ops[op];
    if (base) {
      if (typeof base === 'string')
        base = operations[base];
      obj.base = base;
    }
  }

  return operations;
}

function findRules(op, ruleMap, operations) {
  var opqual = op.split(':');
  op = opqual[0]
  var qualifier = opqual[1] ? ':'+opqual[1] : '';
  var obj = typeof op === 'string' ? operations[op] : op;
  if (!obj) throw new InvalidAccessSpec(null, "unknown op: " + op);
  var rules = [];
  while (obj) {
    rule = ruleMap[obj.name + qualifier];
    if (rule)
      rules.push(rule);
    obj = obj.base;
  }
  return rules;
}

function makeMap(operationAccessMap, makeRule) {
  var map = {};
  for (var key in operationAccessMap) {
    var val = operationAccessMap[key];
    var ops = key.split('|');
    if (ops.length > 1) {
      for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        if (map[op] !== undefined)
          throw new InvalidAccessSpec(this, "duplicate operation specified");
        map[op] = val.check ? val : makeRule(val);
      }
    } else {
      if (map[key] !== undefined)
        throw new InvalidAccessSpec(this, "duplicate operation specified");
      map[key] = val.check ? val : makeRule(val);
    }
  }
  return map;
};

function createCheckerFactory(ops, strategy) {
  return _.partial(createChecker, _, ops, _, strategy);
}

function createChecker(map, ops, strategy, baseStrategy) {
  var operations = makeOps(ops);
  var maps = Array.isArray(map) ? map : [map];
  var makeRule = ruleFactory(_.defaults({}, strategy || {}, baseStrategy || {}, Strategy));
  var normalizedMaps = _.map(maps, function(m) { return makeMap(m, makeRule)});
  var normalizedMap = _.defaults.apply(_, normalizedMaps);
  return {
    accessControlMap: normalizedMap,
    getRules: function(op) {
      return findRules(op, normalizedMap, operations);
    },
    check: function(op, principle, obj) {
      return check(principle, obj, this.getRules(op));
    },
    ensure: function(op, principle, obj) {
      return ensure(principle, obj, this.getRules(op));
    }
  }
}

/*
Returns the result of a the check that applies or undefined
*/
function check(user, obj, guards) {
  if (!Array.isArray(guards))
    guards = Array.prototype.slice.call(arguments, 2);
  for (var i = 0; i < guards.length; i++) {
    if (guards[i] === undefined)
      continue;
    var test = guards[i].check(user, obj);
    if (test !== undefined)
      return test;
  }
  return undefined;
}

function ensure() {
  var args = Array.prototype.slice.call(arguments);
  if (!check.apply(this, args))
    throw new AccessDeniedError(); //denied or no rule applied
  return true;
}

function InvalidAccessSpec(guard, message){
  this.name = InvalidAccessSpec.name;
  this.guard = guard;
  this.message = "invalid access spec" + (message ? ": " + message : "");
}
InvalidAccessSpec.prototype = Error.prototype;
InvalidAccessSpec.name = 'InvalidAccessSpec';

function AccessDeniedError(message){
  this.name = AccessDeniedError.name;
  this.message = "access denied" + (message ? ": " + message : "");
}
AccessDeniedError.prototype = Error.prototype;
AccessDeniedError.name = 'AccessDeniedError';

exports.InvalidAccessSpec = InvalidAccessSpec;
exports.AccessDeniedError = AccessDeniedError;
exports.ensure = ensure;
exports.check = check;
exports.Strategy = Strategy;
exports.ruleFactory = ruleFactory;
exports.makeMap = makeMap;
exports.createCheckerFactory = createCheckerFactory;
exports.createChecker = createChecker;
