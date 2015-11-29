var mongoose = require('mongoose');
var _ = require('underscore');
var models = require('../models');
var utils = require('../lib/utils');
var moment = require('moment');
var getModelFromId = require('../models').getModelFromId;

function isDbId(data) {
  var match = data && data.match && data.match(/@(\w+)@[0-9a-f]+/);
  return match && match[1];
}

module.exports.edit = function(req, res, next) {
  var objId = req.params.id;
  var model = getModelFromId(objId);

  utils.resolvePromises({
    obj: model.findById(objId).exec(),
    paths: _.omit(model.schema.paths,'_id', '__t', '__v'),
    isDbId: isDbId,
    formatdata: formatdata,
    readonlyField: function(schemafield, name) {
      // XXX add support for editing date fields
      return (schemafield.options && schemafield.options.type === Date);
    },
    includeField: function(schemafield, name) {
      return schemafield.instance !== 'Buffer';
    },
  }).then(function(result) {
    res.render('edit.html', result);
  }).catch(next); //pass err to next

}


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

function formatdata(data) {
  if (!data && typeof data !== 'number') {
    return '';
  }
  if (data instanceof Date) {
    return moment(data).format()
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
  var model = models[req.params.model];
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
