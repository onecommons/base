var mongoose = require('mongoose');
var Promise = require('promise');
var createSchema = require('../lib/createmodel').createSchema;
var request = require('request');

var fileSchema = mongoose.Schema({
  name: String,
  creationDate : { type: Date, default: Date.now},
  modificationDate : {type: Date, default: Date.now},
  mimetype: {type: String, required: true},
  encoding: String,
  contents: {type: Buffer, required: true},
  size: {type: Number, required: true},
  owner: {type: String, ref: "User"},
  tags: [String]
});

function saveStream(emitter) {
  return new Promise(function(resolve, reject) {
      var buffers = [];
      emitter.on('data', function(d) {
        buffers.push(d);
      })
      .on('error', reject)
      .on('end', function() {
        resolve(Buffer.concat(buffers));
      });
  });
}

fileSchema.statics.saveFileObj = function(fileinfo, ownerid, principle) {
  return saveStream(fileinfo.file).then( function(buffer) {
    var file = new (module.exports.getModel())();
    file.name = fileinfo.filename;
    file.mimetype = fileinfo.mimetype;
    file.encoding = fileinfo.encoding;
    file.contents = buffer;
    file.size = file.contents.length;
    if (fileinfo.tags)
      file.tags = fileinfo.tags;
    if (ownerid) {
      file.owner = ownerid;
    }
    if (principle)
      file.setPrinciple(principle);
    return file.saveP();
  });
}

fileSchema.statics.saveUrl  = function(url, ownerid, principle) {
  if (!url)
    throw new Error("missing URL parameter");
  var file = new (module.exports.getModel())();
  return new Promise(function(resolve, reject) {
    request
      .get(url)
      .on('response', function(response) {
        // response.statusCode // XXX if not 200 ??
        file.mimetype = response.headers['content-type'];
        var contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          //attachment; filename=" fileName
          var match = contentDisposition.match(/filename=\"?(.+)\"?/);
          if (match) {
            file.name = match[1];
          }
        }
        resolve(response);
      })
      .on('error', reject);
  }).then(saveStream).then(function(buffer) {
    file.contents = buffer;
    file.size = file.contents.length;
    if (ownerid) {
      file.owner = ownerid;
    }
    if (principle)
      file.setPrinciple(principle);
    return file.saveP();
  });
}

module.exports = createSchema('File', fileSchema);
