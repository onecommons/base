var swig = require('swig');
var includetag = require('swig/lib/tags')['include'];

var ignore = 'ignore',
  missing = 'missing',
  only = 'only',
  include = 'include',
  domidToken = "domidToken";

exports.compile = function (compiler, args, clientModel) {
  var varnames = args.pop();
  var includeIdx = args.indexOf(include);
  var doInclude = includeIdx !== -1 ? args.splice(includeIdx, 1) : false;
  var filename = args[0]
  var domidIdx = args.indexOf(domidToken);
  var domid = domidIdx !== -1 ? args.splice(domidIdx, 2)[1] : false;
  var out = '', modelvalue = '';
  if (doInclude || clientModel) {
    out = includetag.compile(compiler, args);
  }
  if (clientModel) {
    if (!args.length) { //don't want to serialize entire _ctx to client
      throw new Error('client tags requires "with /var/ only"');
    }
    modelvalue = ',' + args.join('');
  }
  var prolog = "_ext.addToClientModel(_ctx," + domid + "," + filename + modelvalue  + ');'
  return doInclude ? prolog + out : prolog;
};

exports.parse = function (str, line, parser, types, stack, opts) {
  //copy of include.parse
  //note return true to do default parser stuff
  var file, w;
  var domid, varnames=[];

  parser.on(types.STRING, function (token) {
    //console.log('s', token, file, domid)
    if (!file) {
      file = token.match;
      this.out.push(file);
      return;
    }
    
    //added domid attribute at end:
    if (file && !domid) {
      domid = token.match;
      this.out.push("domidToken");
      this.out.push(domid);
      return;
    }
    
    return true;
  });

  parser.on(types.VAR, function (token) {
      if (!w && token.match == include) {
        this.out.push(include);
        return;
      }
/* bug in include tag code?
    if (!file) {
      file = token.match;
      return true;
    }
*/

    if (!w && token.match === 'with') {
      w = true;
      return;
    }

    if (w && token.match === only && this.prevToken.match !== 'with') {
      this.out.push(token.match);
      return;
    }

    if (token.match === ignore) {
      return false;
    }

    if (token.match === missing) {
      if (this.prevToken.match !== ignore) {
        throw new Error('Unexpected token "' + missing + '" on line ' + line + '.');
      }
      this.out.push(token.match);
      return false;
    }

    if (this.prevToken.match === ignore) {
      throw new Error('Expected "' + missing + '" on line ' + line + ' but found "' + token.match + '".');
    }
    
    varnames.push(token.match);
    return true;
  });

  parser.on('end', function () {
    this.out.push(opts.filename || null);
    this.out.push(varnames);
  });

  return true; 
};