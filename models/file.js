var mongoose = require('mongoose');
var Promise = require('promise');
var createSchema = require('../lib/createmodel').createSchema;

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

fileSchema.statics.saveFileObj = function(fileinfo, rpcSession) {
  var self = this;
  return new Promise(function(resolve, reject) {
      var buffers = [];
      fileinfo.file.on('data', function(d) {
        buffers.push(d);
      })
      .on('end', function() {
        try {
          var file = new (module.exports.getModel())();
          file.name = fileinfo.filename;
          file.mimetype = fileinfo.mimetype;
          file.encoding = fileinfo.encoding;
          file.contents = Buffer.concat(buffers);
          file.size = file.contents.length;
          if (fileinfo.tags)
            file.tags = fileinfo.tags;
          if (rpcSession && rpcSession.httpRequest && rpcSession.httpRequest.user) {
            file.owner = rpcSession.httpRequest.user.id;
          }
          file.saveP().then(resolve, reject);
        }catch (err) {
          reject(err);
        }
      })
  });
};

module.exports = createSchema('File', fileSchema);
