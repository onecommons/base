var models  = require('../models');
var utils = require('../lib/utils.js');

module.exports = {
  showFiles: function(req, res) {
    utils.resolvePromises({files: models.File.find({}).exec()})
      .then(function(result) {res.render('files.html', result);})
  },

// /file/:id/:name
  viewFile: function(req, res, next) {
    if (!req.params.id)
      return next()
    models.File.findOne({_id: req.params.id }).exec().then(function(doc) {
      if (!doc)
        return next();
        var buf = doc.contents;
        res.writeHead(buf.length ? 200 : 204, {
          'Content-Length': String(buf.length),
          'Content-Type': doc.mimetype
        });
        res.end(buf);
      }, next);
  }
}
