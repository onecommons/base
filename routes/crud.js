var mongoose = require('mongoose');
var _ = require('underscore');
var models = require('../models');
var utils = require('../lib/utils');
var moment = require('moment');
var getModelFromId = require('../models').getModelFromId;
var jsonrpc = require('../lib/jsonrpc');

function isDbId(data) {
  var match = data && data.match && data.match(/@(\w+)@[0-9a-f]+/);
  return match && match[1];
}

function getPaths(schema, more) {
  return _.omit(schema.paths, '__t', '__v', more);
}

function getHelperFuncs(creating) {
  return {
    isDbId: isDbId,
    formatdata: formatdata,
    getPaths: getPaths,
    creating: creating,
    getInputAttributes: function(schemafield, attributes) {
      if (schemafield.options) {
        if (schemafield.options.ui)  {
          var defaults = schemafield.options.ui.inputtype
                  ? {type: schemafield.options.ui.inputtype}
                  : schemafield.options.ui.inputAttributes;
          if (defaults) {
            _.defaults(attributes, defaults);
          }
        }
        if (schemafield.options.required) {
          attributes.required = "required";
        }
        if (attributes.type) {
          return attributes;
        }
        switch (schemafield.options.type) {
          case Date:
            attributes.type = 'datetime-local';
            break;
          case Boolean:
            attributes.type = 'checkbox';
            break;
          case Number:
            attributes.type = 'number';
            break;
          default:
            attributes.type = 'text';
        }
      }
      return attributes;
    },
    readonlyField: function(schemafield, name) {
      if (schemafield.instance === 'Buffer')
        return true;

      if (schemafield.options && schemafield.options.ui) {
        return schemafield.options.ui.readonly || (schemafield.options.ui.createonly && !creating);
      }
      return false;
    },
    getDefaultValue: function(schemafield, name) {
      if (schemafield.options) {
        if (schemafield.options.type) {
          if (schemafield.options.type !== Date && typeof schemafield.options.type === 'function') {
            return schemafield.options.type();
          }
        } else {
          // "mixed" type, treat as json
          return null;
        }
      }
      return undefined;
    },
    includeField: function(schemafield, name) {
      return true;
    },
  };
}

function render(vars, model, obj, req, res, next) {
  var result = {
    obj: obj,
    paths: getPaths(model.schema, '_id'),
    model: model.modelName,
    noDelete: model.schema.ui && model.schema.ui.noDelete
  };
  if (vars.foreignKeys) {
    vars.getOptionsForForeignKey = function(path, val) {
      //e.g. 'products[0].sku' => 'sku'
      var key = path.split('.').slice(-1)[0];
      return [{value: val, label: vars.foreignKeys[key][val]}];
    }
  }
  _.extend(result, vars, getHelperFuncs(vars.creating));
  res.render('edit.html', result);
}

function addRefs(schema, refs, foreignKeys, prefix) {
  prefix = prefix || '';
  Object.keys(schema.paths).forEach(function(path) {
    var def = schema.paths[path];
    if (def.schema) {
      addRefs(def.schema, refs, foreignKeys, prefix + path + '.');
    } else if (def.options.ref){
      var ref = addRef(prefix + path, def.options.ref);
      if (ref) {
        refs.push(ref);
      }
    } else if (def.options.ui && def.options.ui.foreignKey) {
      foreignKeys[path] = getForeignKeys(def.options.ui.foreignKey.ref, def.options.ui.foreignKey.autocomplete);
    }
  });
}

module.exports.create = function(req, res, next) {
  var model = models[req.params.model];
  if (!model) {
    return next(); // not found
  }
  var newObj = new model();
  render({creating:true}, model, newObj, req, res, next);
};

//XXX revert to async version
function editDeleted(objId, req, res, next) {
  models.Deleted.findById(objId).then(function(obj) {
    if (!obj) {
      return next(); // not found
    }
    obj.setPrinciple(req.user);
    obj.ensure('view');
    var deletedModel = getModelFromId(obj.deletedId);
    var refs = [];
    var foreignKeys = {};
    addRefs(deletedModel.schema, refs, foreignKeys);
    // fetch it again with refs populated
    return runQuery(models.Deleted, refs, {_id: objId}, null, 'object.').then(function(docs) {
      obj = docs && docs[0];
      var restored = new deletedModel();
      restored.set(obj.object);
      restored.setPrinciple(req.user);
      restored.ensure('view');
      utils.resolvePromises(foreignKeys).then(function(foreignKeys) {
        render({deleteId: objId, creating: true, foreignKeys:foreignKeys},
                deletedModel, restored, req, res, next);
      }, next);
    });
  }, next);
}

module.exports.edit = function(req, res, next) {
  var objId = req.params.id;
  if (!objId) {
    return next(); //not found
  }
  var model = getModelFromId(objId);
  if (!model) {
    return next(); // not found
  }
  if (model.schema.ui && model.schema.ui.noModify && !req.query.cloning) {
    res.statusCode = 403;
    return next(new Error("Permission Denied"));
  }
  if (model.modelName === 'Deleted') {
    return editDeleted(objId, req, res, next);
  }
  var refs = [];
  var foreignKeys = {};
  addRefs(model.schema, refs, foreignKeys);
  runQuery(model, refs, {_id: objId}).then(function(docs){
    try {
      var obj = docs && docs[0];
      if (obj) {
        obj.setPrinciple(req.user);
        obj.ensure('view');
        utils.resolvePromises(foreignKeys).then(function(foreignKeys) {
          var vars = {foreignKeys: foreignKeys};
          if (req.query.cloning) {
            obj._id = model.generateId();
            //copy all the unique fields
            vars.creating = true;
            vars.cloning = true;
          }
          render(vars, model, obj, req, res, next);
        }, next);
      } else {
        next(); // not found
      }
    } catch (err) {
      next(err);
    }
  }, next);
};

// /model/path/count
module.exports.addToArray = function(req, res, next) {
  var model = models[req.params.model];
  var count = parseInt(req.params.count);
  var path = req.params.objpath;
  var newObj = new model();
  var array = newObj.get(path);
  // pad with count and add one
  while (array.length < count+1) {
    array.push({});
  }

  var vars = {
   obj:    newObj,
   paths:  getPaths(model.schema.paths[path].schema),
   index: count,
   path: path,
  };
  _.extend(vars, getHelperFuncs(req.query.creating));
  res.render('addtoarray.html', vars);
};

/*
TODO

* datatype formating (e.g. date)
* have details display columns offscreen
window.innerWidth < columnElement.getBoundingClientRect().right
details needs to show path, suppress empty columns
* save hidden colunm state (html5 pushstate?)
* editor
- fieldset based on schema tree
- support object refs: autocomplete (how to display object "titles")
*/


/*
rowspan = total depth - (current depth-1) if cell has no children
colspan = sum of childrens colspan or 1

1   2   3    <= row
----------
a            rowspan=3
b            colspan=1, rowspan=1
  b1       rowspan=2
c            colspan=3, rowspan=1
  c1       colspan=2, rowspan=1
     c1.1
     c1.2
  c2       colspan=1, rowspan=2
*/

function findEmptyColumns(columns, objs, offset) {
  var emptyIndexes = [];
  for (var i = 0; i < columns.length; i++) {
    if (objs.every(function(obj) {
      if (columns[i].path.slice(-2) === '.*') {
        return false;
      }
      var val = obj.get(columns[i].path);
      return !val || val.length === 0;
    })) {
      emptyIndexes.push( (offset||0) + i);
    }
  }
  return emptyIndexes;
}

function setRowspans(headers) {
  var depth = 0;
  for (var i=0; i<headers.length; i++) {
    var rowspan = headers.length - depth
    if (rowspan < 2)
       break
    headers[i].forEach(function(cell) {
      if (!cell.nested)
        cell.rowspan = rowspan;
    });
    depth += 1
  }
}

module.exports.QUERYLIMIT = 10000;
module.exports.MAX_FIELD_LEN = 512;

function formatdata(data, obj) {
  if (!data && typeof data !== 'number') {
    return '';
  }
  if (data instanceof Date) {
    //XXX should be adjusted to displayTz
    return moment(data).format()
  }

  if (data instanceof Buffer && isDbId(obj._id) == 'File') {
    var url = '/admin/file/' + obj._id;
    return "<object data='" +  url + "' ></object><br><a target='_blank' href='" + url + "'>View</a>"; //type='mimetype' typemustmatch
  }

  var objtype = isDbId(data);
  if (objtype) {
    return "<a href='/admin/edit/" + data + "' target=_blank>" + data + "</a>";
  }
  /*
  if (Array.isArray(data)) {
    return "<input class='array' value='" + data.toString() + "'>";
  }
  */
  //limit decimals
  if (typeof data === 'number' && Math.round(data) != data)
    return data.toFixed(4);

  var title = data.title;
  if (title) {
    if (data._id) {
      return "<a href='/admin/edit/" + data._id + "' target=_blank>" + data.title + "</a>";
    } else {
      return data.title;
    }
  }
  return data.toString().slice(0, exports.MAX_FIELD_LEN).replace(/&/g,'&amp;').replace(/</g,'&lt;');
}

function addRef(path, ref) {
  var refmodel = models[ref];
  var titlefields = refmodel && refmodel.schema.ui && refmodel.schema.ui.titlefields;
  return titlefields && {path: path, titlefields: titlefields, model: refmodel}
}

function runQuery(model, refs, match, unwind, refPathPrefix, sort) {
  var query;
  if (unwind) {
    query = model.aggregate({$match: (match || {})}).unwind(unwind);
  } else {
    query = model.find(match || {});
  }
  query.sort(sort || {_id: 'desc'}).limit(exports.QUERYLIMIT);
  // populate doesn't work with aggregate
  !unwind && refs && refs.forEach(function(ref) {
    // load the titlefields so the "title" virtual field works
    query.populate((refPathPrefix||'') + ref.path, '_id ' + ref.titlefields, ref.model);
  });
  return query.exec();
}

// function find(model, req) {
//   model.aggregate({userid, last(orderdate), sum(orders)});
// //http://stackoverflow.com/questions/25231022/mongoose-how-to-group-by-and-populate
// //http://stackoverflow.com/questions/31825744/lean-inside-populate-in-mongoose
//   //.populate('userid local.email').exec()
// }

function findColumnsIndexes(columns, fieldsToShow) {
  if (typeof fieldsToShow === 'string') {
    fieldsToShow = fieldsToShow.split(',');
  }
  var emptyIndexes = [];
  for (var i = 0; i < columns.length; i++) {
    if (fieldsToShow.indexOf(columns[i].path) === -1) {
      emptyIndexes.push(i);
    }
  }
  return emptyIndexes;
}

//XXX unit test with schema with double nested properties and periods in the names
module.exports.table = function(req, res, next) {
  var modelName = req.params.model;
  if (!modelName) {
    if (!utils.checkPermission("admin", req)) {
      return utils.requirePermission("admin", req, res, next);
    }
    var modelNames = Object.getOwnPropertyNames(models.models);
    res.render('crudhome.html', {
      modelNames: modelNames
    });
    return;
  }
  if (res.locals.currentNamedRoute) {
    res.locals.currentNamedRoute.label = modelName;
  }
  var model = models[modelName];
  if (!model) {
    return next(); // not found
  }
  var settings = (req.session.crudSettings && req.session.crudSettings[modelName]) || {};
  var unwind = req.query.unwind;

  var fieldsFilter = req.query.fields && req.query.fields.split(',');
  var headers =[[{name:'id', colspan:1, nested:false, path:'id'}]];
  var footer = [{name:'id', path:'id'}];

  var refs = [];
  var foreignKeys = {};
  Object.keys(model.schema.tree).forEach(function(name) {
    if (name == 'id' || name == '_id')
      return;
    var schema = model.schema.tree[name];
    addToHeader(name, name, schema, 0, unwind);
  });
  setRowspans(headers);
  addToFooter(model.schema.tree, '', unwind);
  var query = req.query.query || req.body.query;
  query = query && JSON.parse(query, function(key, value) {
    if (value === "$currentDate") {
      return new Date();
    } else if (value && value.$date){
      return new Date(value.$date);
    } else {
      return value;
    }
  });
  utils.resolvePromises({
    headers:headers,
    footer:footer,
    colgroups:headers[0],
    formatdata: formatdata,
    modelName: modelName,
    pageLength: settings.pageLength || 10,
    objs: runQuery(model, refs, query, unwind, '', req.query.sort),
    // XXX table needs formatdata to render foreignKeys
    // foreignKeys: utils.resolvePromises(foreignKeys)
  }).then(function(result) {
    // console.dir(result.objs[0].schema);
    if (unwind) {
      result.objs = result.objs.map(function(obj) {
        return new model(obj);
      });
    }
    result.objs.forEach(function(doc) {
      doc.setPrinciple(req.user);
      doc.ensure('view');
    });
    result.data = result.objs.map(function(obj) {
      return footer.map(function(cell) {
        var path = cell.path.slice(-2) === '.*' ? cell.path.slice(0, -2) : cell.path;
        return formatdata(obj.get(path), obj)})
    });
    result.hiddenColumns = (req.query.fields && findColumnsIndexes(footer, fieldsFilter))
                          || settings.hiddenColumns
                          || findEmptyColumns(footer, result.objs);
    res.render('crud.html', result);
  }).catch(next); //pass err to next

  function skipField(path) {
    if (fieldsFilter && fieldsFilter.indexOf(path) == -1) {
      return true;
    }
  }

  function addToHeader(name, path, schema, level, unwind) {
    if (name.slice(0,2) == '__') {
      return 0;
    }
    var colspan = 1;
    var nested = !!model.schema.nested[path];
    //console.log(path, 'nested', nested);
    //console.dir(model.schema.paths[path]);
    function subHeader(schema, concat) {
      colspan = Object.keys(schema.tree).reduce(function(memo, key){
        return memo+addToHeader(key, path+concat+key, schema.tree[key], level+1)
      }, 0);
      if (typeof schema.options.strict === 'boolean' && !schema.options.strict) {
        colspan += 1;
        // add special column for mixed objects
        headers[level+1].push({name: name+concat+'*', colspan: 1, nested:false, path: name+concat+'*'})
      }
      nested = true;
      return colspan;
    }

    if (nested) {
      //count the leaves of this branch
      colspan = Object.keys(schema).reduce(function(memo, key){
        return memo+addToHeader(key, path+'.'+key, schema[key], level+1)
      }, 0);
      if (!colspan) {
        return 0;
      }
    } else if (schema.tree){ //single subdoc
      if (!subHeader(schema, '.')) {
        return 0;
      }
    } else if (path === unwind){
      //schema is a DocumentArray
      if (!subHeader(schema[0], '.0.')) {
        return 0;
      }
    } else {
      if (skipField(path)) {
        return 0;
      }
      if (schema.ref){
        var ref = addRef(path, schema.ref);
        if (ref) {
          refs.push(ref);
        }
      } else if (schema.ui && schema.ui.foreignKey) {
        // foreignKeys[path] = getForeignKeys(schema.ui.foreignKey.ref, schema.ui.foreignKey.autocomplete);
      }
    }
    var cell = {name:name, colspan:colspan, nested:nested, path:path};
    //console.log('name', name, 'nested', nested, 'colspan', colspan);
    var row = headers[level];
    if (row)
      row.push(cell);
    else
      headers[level] = [cell];
    return colspan;
  }

  //only include leaves
  function addToFooter(schema, path, unwind) {
    Object.keys(schema).forEach(function(name) {
      if (name.slice(0,2) == '__')
        return true;
      if (!path && (name == 'id' || name == '_id'))
        return;
      if (model.schema.nested[path+name]) {
        addToFooter(schema[name], path+name+'.', '')
      } else if (schema[name] && schema[name].tree) {
        addToFooter(schema[name].tree, path+name+'.');
        if (typeof schema[name].options.strict === 'boolean' && !schema[name].options.strict) {
          footer.push({name:name, path: path+name+'.*'});
        }
      } else if (name === unwind) {
        addToFooter(schema[name][0].tree, path+name+'.0.')
        if (typeof schema[name][0].options.strict === 'boolean' && !schema[name][0].options.strict) {
          footer.push({name:name, path: path+name+'.0.*'});
        }
      } else {
        if (skipField(path+name)) {
          return;
        }
        footer.push({name:name, path: path+name})
      }
    });
  }
}

function getForeignKeys(modelName, staticMethodName) {
  var model = models[modelName];
  if (!model) {
    return null;
  }
  var staticMethod = model[staticMethodName];
  if (!staticMethod) {
    return null;
  }
  // should returns Array<{value, text}> or Promise<Array<{value, text}>>
  return staticMethod.call(model);
}

module.exports.adminMethods = {
  createfile: function (json, respond, promisesSofar, rpcSession) {
    var userid = rpcSession.httpRequest.user && rpcSession.httpRequest.user.id;
    if (!userid) {
      return respond(new jsonrpc.JsonRpcError(-32001, 'Permission Denied'));
    }

    return rpcSession.getFileRequest(json.name).then(
      function(fileinfo){
        if (json.propertyName) {
          fileinfo.tags = [json.propertyName];
        }
        return models.File.saveFileObj(fileinfo, userid);
    }).then(function(fileObj) {
        // don't return the whole object with the file contents
        return { _id: fileObj.id, tags: fileObj.tags};
    });
  },

  modelAutocomplete: function(json, respond, promisesSofar, rpcSession) {
      var model = models[json.model];
      if (!model) {
        return null;
      }
      var fields = '_id';
      if (model.schema.ui && model.schema.ui.titlefields) {
        fields += ' ' + model.schema.ui.titlefields;
      }
      return model.find({}).select(fields).exec().then(function(docs) {
        return docs && docs.map(function(doc) {return {value: doc._id, text: doc.title || doc._id}});
      });
  },

  customAutocomplete: function(json, respond, promisesSofar, rpcSession) {
      var model = models[json.model];
      if (!model) {
        return null;
      }
      var staticMethod = model[json.autocomplete];
      if (!staticMethod) {
        return null;
      }
      // should returns Array<{value, text}> or Promise<Array<{value, text}>>
      return Promise.resolve(staticMethod.call(model)).then(function(obj) {
        return Object.keys(obj).map(function(key) {return {value:key, text: obj[key]} });
      });
  },

  updateCrudSettings: function(json, respond, promisesSofar, rpcSession) {
    if (!rpcSession.httpRequest.session.crudSettings) {
      rpcSession.httpRequest.session.crudSettings = {};
    }
    if (!rpcSession.httpRequest.session.crudSettings[json.model]) {
      rpcSession.httpRequest.session.crudSettings[json.model] = {};
    }
    rpcSession.httpRequest.session.crudSettings[json.model][json.setting] = json.value;
    return true;
  },

/*
this doesn't work because getIndexes isn't working plus it doesn't handle embedded arrays
  cloneObject: function(json, respond, promisesSofar, rpcSession) {
    return models.findById(json._id).then(function(obj) {
      if (!obj) {
        return new jsonrpc.JsonRpcError(-32001, 'Unable to find object to clone');
      }
      var model = getModelFromId(obj._id);
      if (!model) {
        return new jsonrpc.JsonRpcError(-32001, 'Unable to find model for object');
      }
      var clone = new model();
      model.collection.getIndexes(function(indexes) {
        if (!indexes) {
          return;
        }
        indexes.forEach((index) => {
          if (index.options.unique) {
            // XXX what if key is not a string?
            Object.keys(index.key).forEach( k => obj.set(k, obj.get(k) + '1'));
          };
        });
      });
      delete obj._id;
      clone.set(obj);
      return clone.save().then(function(doc) {
        return { _id: clone._id };
      });
    });
  },
*/

 //XXX revert to async version
  deleteObject: function(json, respond, promisesSofar, rpcSession) {
    return models.findById(json._id).then(function(obj) {
      if (!obj) {
        return new jsonrpc.JsonRpcError(-32001, 'Unable to find object to delete');
      }
      var deleted = new models.Deleted();
      deleted.set({
        deletedId: obj._id,
        object: obj,
        by: rpcSession.httpRequest.user.id
      });
      return deleted.save().then(function(doc) {
        obj.remove();
        return { _id: deleted._id };
      });
    });
  },

  //XXX revert to async version
  restoreObject: function(json) {
    return models.Deleted.findOne({deletedId: json._id}).then(function(doc) {
      var model = doc && getModelFromId(doc.deletedId);
      if (!model) {
        return new jsonrpc.JsonRpcError(-32001, 'Unable to restore object');
      }
      var restored = new model();
      restored.set(doc.object);
      restored.save();
      doc.remove();
      return { _id: doc._id };
    });
  }
};
