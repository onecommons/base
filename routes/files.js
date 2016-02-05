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
      // XXX files are immuntable and their url is unique so it would be good to
      // have a config option to enable client-side caching
      // res.setHeader("Cache-Control", "public, max-age=31536000");
      var buf = doc.contents;
      res.writeHead(buf.length ? 200 : 204, {
          'Content-Length': String(buf.length),
          'Content-Type': doc.mimetype
      });
      res.end(buf);
    }, next);
  }
}
