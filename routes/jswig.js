// jswig.js  route
var swig      = require('swig');
var fs        = require('fs');
var path      = require('path');

module.exports = function(app) {
  return function(req,res,next){
  // look for a <tmpl>.html file, compile it into js and return it.
  var viewdir = app.get('views');
  var pathSegment = req.params[0];
  var ext = path.extname(pathSegment);
  if (ext.length)
    pathSegment = pathSegment.slice(0, -1*ext.length);
  var thePath = viewdir + '/' + pathSegment + '.html';
  var tpl;

  fs.exists(thePath, function(exists){
    if(!exists) {
      res.sendStatus(404);
      return;
    } else {
      fs.readFile(thePath, function (err, data) {
        if (err) {
          next(err);
          return;
        }
        try {
          var prologue = "$.templates['" + pathSegment + "'] = ";
          tpl = prologue + swig.precompile(data.toString()).tpl.toString().replace('anonymous', '');
        } catch(err) {
          next(err);
          // console.log("swig error: ", err);
          // res.send('500', "Swig " + err);
          return;
        }
        // console.log(tpl);
        res.type('application/javascript');
        res.send(tpl);
      });
    }
  }); // fs.exists...
 };
}
