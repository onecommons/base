var mongoose = require('mongoose');
var createSchema = require('../lib/createmodel').createSchema;

var emailSchema = mongoose.Schema({
  to:      {type: String, required: true},
  from:    {type: String, required: true},
  subject: {type: String, required: true},
  html:    {type: String, required: true},
  sendOn:  {type: Date},
  sentOn:  {type: Date},
  status:  {type: String, enum: ['pending', 'sent', 'failed', 'cancelled'], default: 'pending'},
});

emailSchema.statics.saveEmail = function(app, template, user, vars, sendOn) {
  var message = app.email.renderMessage(template, user, vars);
  var email = new this(message);
  if (sendOn) {
    email.sendOn = sendOn;
  }
  return email.save();
},

emailSchema.methods.sendNow = function(app) {
  var self = this;
  return app.email.sendMessageNow(this).then(
      function(result) {
        return self.set({
          sentOn: new Date(),
          status: 'sent'
        }).save();
      }, function(err) {
        return self.set({
          sentOn: new Date(),
          status: 'failed'
        }).save();
      }
  );
}

module.exports = createSchema('Email', emailSchema);
