var _ = require('underscore');
var path = require('path');
var utils = require('./utils');
var isAbsolute = require('express/lib/utils').isAbsolute;
var assert = require('assert');

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
  var out = '<script>if (window.$ && !$.templates) $.templates = {}</script>';
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

    var clientData = {};
    var modelJson = JSON.stringify(_ctx.clientTemplates,
      function(k,v) {return serializeRefs(k,v,clientData)}).replace(/"@@@(.+?)@@@"/g, "\$.dbCache['$1']");
    out += "\n<script>$.dbCache=" + JSON.stringify(clientData) + ';\n';
    out += "$(document).ready(function() {$.each(" + modelJson
    +", function(domid, model) {\n"
    +"     $('#'+domid).data('_template', model.template);\n"
    +"     $('#'+domid).data('_model', model.model);});\n"
    +"});</script>\n";
    //XXX should be a generic way to introspect _ctx for variables intended for client and to render them
    if (_ctx.routes && _ctx.routes.getUrlMapSource) { //XXX dbRender() needs to add routes to template locals
      out += "\n<script>$.routes=" + _ctx.routes.getUrlMapSource() + '</script>\n';
    }
 }
  return out;
}

/*
top level invocation:

from: empty || any
to: absolute
absolute

from: empty
to: relative
search [derived, derived/base, base]

(enable access to files with same name)

from: empty
to:   "base/"
search [derived/base, base]

happens when including a file:

from: derived | derived/base
to:   relative
search [derived, derived/base, base]

(enable overrides)
from: base
to:  any relative
search [derived/base, base]

(enable access to files with same name)

from: derived
to:   "base/"
search [derived/base, base]


(enable equivalent of "super()")

from: derived/base | base
to:   "base/"
search [base]

*/
function getPathLoader(swig, viewpaths) {
  assert(viewpaths.length == 2);
  var loader = swig.loaders.fs();

  loader.resolve = function (to, from) {
    //console.log('start resolve', to, from, to && isAbsolute(to));
    if (!to) return '';
    if (isAbsolute(to)) {
      //XXX if starts with /base, strip it and skip normalize(join()) below
      return to;
    }

    var tobase = to.match("^base"+path.sep);
    if (tobase)
      to = to.slice(5);

    if (!from) {

      if (tobase) {
        return utils.searchPath([path.join(viewpaths[0], 'base'), viewpaths[1]], to);
      } else {
        return utils.searchPath([viewpaths[0],
          path.join(viewpaths[0], 'base', path.sep),
          viewpaths[1]], to)
      }

    } else {

      var rootlen, fromderivedbase, fromderived = from.indexOf(viewpaths[0]) === 0;
      if (fromderived) {
        rootlen = viewpaths[0].length;
        fromderivedbase = from.substr(rootlen, 5) == "base"+path.sep;
        if (fromderivedbase)
          rootlen += 5;
      } else {
        rootlen = viewpaths[1].length;
      }

      var fromroot = path.dirname(from).slice(rootlen);
      to = path.normalize(path.join(fromroot, to));
      //console.log("resolve resolve", fromroot, to);

      if (tobase) {
        if (fromderived && !fromderivedbase)  {
          //search [derived/base, base]
          return utils.searchPath([path.join(viewpaths[0], 'base', path.sep), viewpaths[1]], to);
        } else {
          assert(!fromderived || fromderivedbase);
          return utils.searchPath([viewpaths[1]], to); //[base]
        }
      } else {
        if (fromderived) { //[derived, derived/base, base]
          return utils.searchPath([viewpaths[0], path.join(viewpaths[0], 'base', path.sep), viewpaths[1]], to);
        } else { //base
          return utils.searchPath([path.join(viewpaths[0], 'base', path.sep), viewpaths[1]], to);
        }
      }
    }
  }

  var superload = loader.load;
  loader.load = function (identifier, cb) {
    //path resolve
    if (!identifier)
      throw new Error('can not load empty identifier');
    return superload(identifier, cb);
  }
  return loader;
}

module.exports = function(swig, opt) {
  var clientinclude = require('../lib/swigtags/clientinclude');
  swig.setTag('clienttemplate', clientinclude.parse, function(compiler, args) {return clientinclude.compile(compiler, args, false)});
  swig.setTag('clientmodel', clientinclude.parse, function(compiler, args) {return clientinclude.compile(compiler, args, true)});
  var clientrender = require('../lib/swigtags/clientrender');
  swig.setTag('clientrender', clientrender.parse, clientrender.compile);
  swig.setExtension('addToClientModel', addToClientModel);
  swig.setExtension('renderClientside', renderClientside);
  if (opt) {
    swig.setDefaults(
      _.defaults(opt, {
        loader: getPathLoader(swig, opt.loaderPath || [])
      })
    );
  }

  return {
    addToClientModel: addToClientModel,
    renderClientside: function(_ctx) {return renderClientside(_ctx,opt)}
  }
}
