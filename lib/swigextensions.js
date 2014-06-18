var _ = require('underscore');
var path = require('path');

function normalizePath(templatepath) {
  var ext = path.extname(templatepath);
  if (ext.length)
    templatepath = templatepath.slice(0, -1*ext.length);
  return path.normalize(templatepath);
}

function addToClientModel(_ctx, domid, filename, model) {
  if (!_ctx.clientTemplates)
    _ctx.clientTemplates = {}
  _ctx.clientTemplates[domid] = {
    template: normalizePath(filename) //needs to match path name in routes/jswig.js
  }
  if (model) {
    _ctx.clientTemplates[domid].model = model;
  }
}

/*
If an object looks like a database obj, add it to clientData and serialize it out
as a string that would eval on the client as reference an object in the dbCache.
*/
function serializeRefs(k,v, clientData) {
  if (k == 'clientTemplates') {  //avoid circular refs but doesn't seem to work??
    return undefined;
  }
  if (v && typeof v === 'object') {
    //we have to do it like this to avoid toString being call internally
    var copy = new v.constructor();
    for (var prop in v) {
      if (!v.hasOwnProperty(prop)) continue;
      var val = v[prop]
      if (val && val._id) {
        var obj = val;
        clientData[obj._id] = _.extend(clientData[obj._id] || {}, obj);
        val = "@@@" + obj._id+ "@@@";
      }
      copy[prop] = val;
    }
    return copy;
  }
  return v;
}

//dictionary of persistent objects
//model objects have references to the values in that dictionary
//dom elements are associated with the template and model via jquery's data()
function renderClientside(_ctx, opt) {
  var out = '<script>if (!$.templates) $.templates = {}</script>';
  if (_ctx.clientTemplates) {
    var templates = {};
    ///jscript/templatename.html => $.templates['templatename'] = function() {}
    _.each(_ctx.clientTemplates, function(value) {
      if (!templates[value.template]) {
        var scriptpath = value.template;
        var ext = path.extname(scriptpath);
        if (ext.length)
          scriptpath = scriptpath.slice(0, -1*ext.length);
        out += "<script async defer src='/jswig/" + normalizePath(scriptpath) +".js'></script>\n";
        templates[value.template] = true;
      }
    });
    out += '<script src="' + path.join( (opt && opt.jsbase) || "/js/", "swig.min.js") + '"></script>\n';

    clientData = {};
    var modelJson = JSON.stringify(_ctx.clientTemplates,
      function(k,v) {return serializeRefs(k,v,clientData)}).replace(/"@@@(.+?)@@@"/g, "\$.dbCache['$1']");
    out += "\n<script>$.dbCache=" + JSON.stringify(clientData) + ';\n';
    out += "$(document).ready(function() {$.each(" + modelJson
    +", function(domid, model) {\n"
    +"     $('#'+domid).data('_template', model.template);\n"
    +"     $('#'+domid).data('_model', model.model);});\n"
    +"});</script>\n";
 }
  return out;
}

module.exports = function(swig, opt) {
  var clientinclude = require('../lib/swigtags/clientinclude');
  swig.setTag('clienttemplate', clientinclude.parse, function(compiler, args) {return clientinclude.compile(compiler, args, false)});
  swig.setTag('clientmodel', clientinclude.parse, function(compiler, args) {return clientinclude.compile(compiler, args, true)});
  var clientrender = require('../lib/swigtags/clientrender');
  swig.setTag('clientrender', clientrender.parse, clientrender.compile);
  swig.setExtension('addToClientModel', addToClientModel);
  swig.setExtension('renderClientside', renderClientside);

  return {
    addToClientModel: addToClientModel,
    renderClientside: function(_ctx) {return renderClientside(_ctx,opt)}
  }
}
