
var mongoose = require("mongoose");
var util = require('util');
var access = require('../lib/access');
var _ = require('underscore');

var accesslevels = {
guest:0, //anyone has this right
user:1,  //authenticated user
verifieduser:2, //recently authenticated user (note: stateful, same user can change)
//group:3,  //only principles who members of the group referred to by the "group" property
//owner:4,  //only owner (principle matches 'owner' property)
admin:5,  //only principle with admin role
system: 6 //denied to all except system code
};

var defaultrole = accesslevels.user;

var policy = new access.Policy({
  'any': undefined,
  'read': 'any',
  'write': 'any',
  'edit':'write',
  'create':'write',
  'remove': 'write',
  'view': 'read',
});
policy.defaultaccesscontrol = {'any': 'admin'};
policy.hasPermission = function(user, object, rel, guards) {
  var role = user.role ? accesslevels[user.role] : defaultrole; //XXX
  var neededLevel = Math.max.apply(null, _(guards).map(function(g){ return accesslevels[g]; }));
  //console.log('neededLevel', neededLevel, 'user role level', role);
  return role >= neededLevel;
}


var _currentPolicy = policy;
function getAccessControlPolicy() {
  return _currentPolicy;
}
function setAccessControlPolicy(p) {
  _currentPolicy = p;
}

function guardSchemaPlugin(schema, options) {
  var accesscontrol = options.map;
  if (!options.base) {
    //we have to do the check as properties are set because rules can depend
    //on the values of the properties so we need to check with the original value
    schema.pre('markModified', function (next, key) {;
      var user = this.getPrinciple();
      if (user) {
        var op = this.isNew ? 'create' : 'edit';
        if (!(key == '_id' && this.isNew)) {
          this.ensure(op, key);
        }
      }
      next();
    });
    schema.pre('save', function (next) {
      var user = this.getPrinciple();
      if (user) {
        try {
           //if we haven't already done a check, do one now
           var paths = this.modifiedPaths();
           var count = 0;
           if (this.isNew && paths.indexOf('_id') > -1)
             count++; //ignore _id
           if (paths.length <= count) {//there were no paths that were checked
             var op = this.isNew ? 'create' : 'edit';
             this.schema.statics.ensure(user, op); //need the most derived schema
           }
        } catch (err) {
           next(err);
        }
      }
      next();
    });
  };
  schema.getChecker = function() {
    //need to create this lazily to wait for access control policy to be set
    if (!schema._checker) {
      var policy = options.policy || getAccessControlPolicy();
      var accesscontrolList = options.base ?
          [accesscontrol, options.base.schema.getChecker().accessControlMap]
         : [accesscontrol, options.defaultmap || policy.defaultaccesscontrol];
      //console.trace('b', options.base ? !!options.base.schema._checker : 'no base', accesscontrolList)
      schema._checker = access.createChecker(accesscontrolList, policy);
    }
    return schema._checker;
  };
  schema.methods.setPrinciple = function(p) {
    this._principle = p
  };
  schema.methods.getPrinciple = function() {
    return this._principle;
  };
  schema.methods.findAccessRules = function(op, prop) {
    var rules = [];
    if (prop)
      rules = this.schema.getChecker().getRules(op+':'+prop)
    rules = rules.concat( this.schema.getChecker().getRules(op) );
    return rules;
  };
  schema.methods.check = function(op, prop) {
    var rules = this.findAccessRules(op, prop);
    return access.check(this.getPrinciple(), this, rules);
  };
  schema.methods.ensure = function(op, prop) {
    var rules = this.findAccessRules(op, prop);
    return access.ensure(this.getPrinciple(), this, rules);
  };
  schema.statics.check = function(principle, op) {
    return access.check(principle, {}, schema.getChecker().getRules(op));
  };
  schema.statics.ensure = function(principle, op) {
    return access.ensure(principle, {}, schema.getChecker().getRules(op));
  };
}

/*
 * @param {String} name model name
 * @param {Schema} [schema] (plain object or Schema object)
 * @param {Object} [options] schema options (optional, only use if schema is plain object)
 * @param {Model} [baseModel] base model to inherit from (optional)
 *
 * options and baseModel are mutually exclusive
 *
 * @api public
 */
var createModel = function(modelName, schema, optionsOrbaseModel, accesscontrol) {
  var baseModel = undefined, options = undefined;
  if (optionsOrbaseModel) {
    if (optionsOrbaseModel.model && optionsOrbaseModel.schema) //hacky duck-typing
      baseModel = optionsOrbaseModel;
    else
      options = optionsOrbaseModel;
  }
  accesscontrol = accesscontrol || {};

  var requiredKeys = {
    _id: String
  };

  if (!baseModel) //don't add this if derived class since mongoose already will
    requiredKeys['__t'] = {type: String, default: modelName}

  var isSchemaInstance = schema instanceof mongoose.Schema;
  if (options && isSchemaInstance)
    throw new Error("can't use options with a Schema object");
  for (var key in requiredKeys) {
    if (!requiredKeys.hasOwnProperty(key))
      continue;
    var val = requiredKeys[key];
    if (isSchemaInstance) {
      schema.path(key, val);
    } else { //plain object
      schema[key] = val;
    }
  }

  var model;
  if (baseModel) {
    if (isSchemaInstance) {
      if (!(schema instanceof baseModel.schema.constructor)) {
        throw new Error(schema.constructor.name + " must inherit from " +  baseModel.schema.constructor.name);
      }
    } else {
      //schema is just the definition
      //create a new schema class derived from the base class
      var schemaClass = function(){
        baseModel.schema.constructor.apply(this, arguments);
        //copy base schema
        var This = this;
        baseModel.schema.eachPath(function(key, val) {
          if (key != '__t')
            This.paths[key] = val;
        });
      };
      util.inherits(schemaClass, baseModel.schema.constructor);
      //note: mongoose doesn't support different options in the derived class
      //so copy base options to avoid "Discriminator options are not customizable" error
      schema = new schemaClass(schema, baseModel.schema.options);
    }
    model = baseModel.discriminator(modelName, schema);
    if (!accesscontrol.disable) {
      schema.plugin(guardSchemaPlugin, {map:accesscontrol, base:baseModel});
    }
  } else {
    if (!isSchemaInstance) {
      schema = new mongoose.Schema(schema, options || {});
    }
    //don't do this if baseClass or else it will get called twice
    schema.pre('save', function(next){
       //console.log("save hook", this._id, modelName, this.constructor.modelName);
       if(this.isNew && !this._id){
           this._id =  '@' + this.constructor.modelName + '@' + mongoose.Types.ObjectId().toString();
       }
       next();
    });
    if (!accesscontrol.disable) {
      //needs to be called before creating the model (for methods and statics)
      //but after the above save hook
      schema.plugin(guardSchemaPlugin, {map:accesscontrol});
    }
    model = mongoose.model(modelName, schema);
 }

  model.willGenerateId = true;
  return model;
};

createModel.getAccessControlPolicy = getAccessControlPolicy;
createModel.setAccessControlPolicy = setAccessControlPolicy;
createModel.guardSchemaPlugin = guardSchemaPlugin;
module.exports = exports = createModel;
