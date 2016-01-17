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
    getInputType: function(schemafield) {
      if (schemafield.options) {
        if (schemafield.options.ui && schemafield.options.ui.inputtype) {
          return schemafield.options.ui.inputtype;
        }
        if (schemafield.options.type === Date) {
          return 'datetime-local';
        }
      }
      return 'text';
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

function render(creating, model, obj, req, res, next) {
  utils.resolvePromises({
    obj: obj,
    paths: getPaths(model.schema, '_id'),
    model: model.modelName
  }).then(function(result) {
    _.extend(result, getHelperFuncs(creating));
    res.render('edit.html', result);
  }).catch(next); //pass err to next
}

module.exports.create = function(req, res, next) {
  var model = models[req.params.model];
  var newObj = new model();
  render(true, model, newObj, req, res, next);
};

module.exports.edit = function(req, res, next) {
  var objId = req.params.id;
  var model = getModelFromId(objId);
  render(false, model, model.findById(objId).exec(), req, res, next);
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
{{macro display(obj)}}
display
  for prop in obj
    if item is object
      <div>
       display(item)
     </div>
    else
       <span>{{prop}}</span>: <span>{{format(obj[prop])}}</span>
{#endmacro}}
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

  return data.toString().slice(0, exports.MAX_FIELD_LEN).replace(/&/g,'&amp;').replace(/</g,'&lt;');
}

//XXX unit test with schema with double nested properties and periods in the names
module.exports.table = function(req, res, next) {
  var headers =[[{name:'id', colspan:1, nested:false, path:'id'}]];
  var footer = [{name:'id', path:'id'}];
  var modelName = req.params.model;
  var model = models[modelName];
  //XXX if (!model) { unknown}
  //console.dir(model.schema.paths.roles);

  Object.keys(model.schema.tree).forEach(function(name) {
    if (name == 'id' || name == '_id')
      return;
    var schema = model.schema.tree[name];
    addToHeader(name, name, schema, 0);
  });
  setRowspans(headers);
  addToFooter(model.schema.tree, '');

  utils.resolvePromises({
    headers:headers,
    footer:footer,
    colgroups:headers[0],
    formatdata: formatdata,
    modelName: modelName,
    objs: model.find({}, null, { limit: exports.QUERYLIMIT }).exec()
  }).then(function(result) {
    // console.dir(result.objs[0].schema);
    result.hiddenColumns = findEmptyColumns(footer, result.objs);
    res.render('crud.html', result);
  }).catch(next); //pass err to next

  function addToHeader(name, path, schema, level) {
    if (name.slice(0,2) == '__')
      return 0;
    var colspan = 1;
    var nested = model.schema.nested[path];
    //console.log(path, 'nested', nested);
    //console.dir(model.schema.paths[path]);
    if (nested) {
      //count the leaves of this branch
      colspan = Object.keys(schema).reduce(function(memo, key){
        return memo+addToHeader(key, path+'.'+key, schema[key], level+1)
      }, 0);
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
  function addToFooter(schema, path) {
    Object.keys(schema).forEach(function(name) {
      if (name.slice(0,2) == '__')
        return;
      if (!path && (name == 'id' || name == '_id'))
        return;
      if (model.schema.nested[path+name])
        addToFooter(schema[name], path+name+'.')
      else
        footer.push({name:name, path: path+name})
    });
  }

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
  }
};
