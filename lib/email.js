var url = require('url');
var path = require('path');

var nodemailer = require('nodemailer');
var swig  = require('swig');

module.exports = function(app) {
  var config = app.loadConfig('email');

  return {
    sendWelcome: function(user) {
      sendMessage(config.templates.signup, user);
    },

    resendVerification: function(user) {
      sendMessage(config.templates.resend, user);
    },

    sendForgot: function(user) {
      sendMessage(config.templates.forgot, user);
    }
  }

function createTransport() {
  var cfg = config.mailer;
  // console.log("Creating mailer with transport:" + cfg.transport);
  // console.log(cfg);
  return nodemailer.createTransport(cfg.transport, cfg.config);
}

function sendMessage(template, user) {

  // XXX need a better way to generate link
  var link = url.resolve(config.appurl, "/verification/" + user.local.signupToken);

  var emailVars = {
    'appname': config.appname,
    'appurl': config.appurl,
    'link': link
  }

  var msgSubject = swig.render(template.subject, {locals:emailVars}); 
  var msgBody    = swig.renderFile(template.templatePath, emailVars);

  var transport = createTransport();

  var message = {
      generateTextFromHTML: true,

      from: config.from,
      to: user.local.email,
      subject: msgSubject,
      html: msgBody
  }
  // console.log(message);

  // XXX what to do with error callbacks here?
  // these are operational issues that should be logged so alerts can be triggered
  transport.sendMail(message, function(error, response) {
    if (error) {
      console.log("Error sending mail!")
      console.log(error);
    } else {
      console.log("Message sent: " + response.message);
      console.log(JSON.stringify(response));
    }

    transport.close(); // shut down the connection pool, no more messages
  });

}

};
