
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

var strategy = {
  //XXX just for testing!!!
  //need to replace with levels
  //userHasPermission
  userHasGuards: function(user, object, rel, guards) {
    var role = user.role ? accesslevels[user.role] : defaultrole;
    var neededLevel = Math.max.apply(null, _(guards).map(function(g){ return accesslevels[g]; }));
    //console.log('neededLevel', neededLevel, 'user role level', role);
    return role >= neededLevel;
  }
};

var defaultaccesscontrol = {'any': 'admin'};

var createChecker = access.createCheckerFactory({
  'any': undefined,
  'read': 'any',
  'write': 'any',
  'edit':'write',
  'create':'write',
  'remove': 'write',
  'view': 'read',
}, strategy);

function guardSchemaPlugin(schema, options) {
  var accesscontrol = options.map;
  //var createChecker = options.createChecker || createChecker;
  if (options.base) {
    schema.checker = createChecker([accesscontrol,
            options.base.schema.checker.accessControlMap]);
  } else {
    schema.checker = createChecker([accesscontrol,
          options.defaultmap || defaultaccesscontrol]);
    schema.pre('save', function (next) {;
      var user = this.getPrinciple();
      if (user) {
        try {
          var op = this.isNew ? 'create' : 'edit';
          var This = this;
          var typeCheck = false;
          this.modifiedPaths().forEach(function(path) {
            This.ensure(op, path, typeCheck);
            typeCheck = true;
          });
          if (!typeCheck) {//there were no modified paths
            schema.statics.ensure(user, op);
          }
        } catch (err) {
          console.log('access plugin error', err);
          next(err);
        }
      }
      next();
    });
  }

  schema.methods.setPrinciple = function(p) {
    this._principle = p
  },
  schema.methods.getPrinciple = function() {
    return this._principle;
  },
  schema.methods.findAccessRules = function(op, prop, skipTypeCheck) {
    var rules = [];
    if (prop)
      rules = this.schema.checker.getRules(op+':'+prop)
    if (!prop || !skipTypeCheck)
      rules = rules.concat( this.schema.checker.getRules(op) );
    return rules;
  },

  schema.methods.check = function(op, prop, skipTypeCheck) {
    var rules = this.findAccessRules(op, prop, skipTypeCheck);
    return access.check(this.getPrinciple(), this, rules);
  },
  schema.methods.ensure = function(op, prop, skipTypeCheck) {
    var rules = this.findAccessRules(op, prop, skipTypeCheck);
    if (skipTypeCheck && !rules.length)
      return false;//type check already done so don't throw if no rules
    return access.ensure(this.getPrinciple(), this, rules);
  },

  schema.statics.check = function(principle, op) {
    return access.check(principle, {}, schema.checker.getRules(op));
  },
  schema.statics.ensure = function(principle, op) {
    return access.ensure(principle, {}, schema.checker.getRules(op));
  }
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
module.exports.createModel = createModel = function(modelName, schema, optionsOrbaseModel, accesscontrol) {
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
       //console.log("IN SAVE HOOK", this._id, modelName, this.constructor.modelName);
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

module.exports = exports = createModel;
