var url = require('url');
var path = require('path');
var _ = require('underscore');
var nodemailer = require('nodemailer');
var swig  = require('swig');
var log = require('./log');

module.exports = function(app) {
  var config = app.loadConfig('email');

  function createTransport() {
    var cfg = config.mailer;
    // console.log("Creating mailer with transport:" + cfg.transport);
    // console.log(cfg);
    return nodemailer.createTransport(cfg.transport, cfg.config);
  }

  function sendMessage(template, user) {
    var appurl = app.getExternalUrl();
    var emailVars = _.defaults(template.templateVars || {}, config.templateVars || {}, {
      'appurl': appurl
    });
    // XXX should use route resolution fns
    if (user && user.local.signupToken) {
      emailVars.signupLink = appurl + "/verification/" + user.local.signupToken;
    }
    if (user && user.local.resetToken) {
      emailVars.resetLink = appurl + "/forgot/" + user.local.resetToken;
    }

    var msgSubject = swig.render(template.subject, {locals:emailVars});
    var msgBody    = swig.renderFile(template.templatePath, emailVars);

    var transport = createTransport();

    var message = {
        generateTextFromHTML: true,

        from: config.from,
        to: template.to || user.local.email,
        subject: msgSubject,
        html: msgBody
    };

     return new Promise(function(resolve, reject) {
      transport.sendMail(message, function(error, response) {
        transport.close(); // shut down the connection pool, no more messages

        if (error) {
          log.error(error, "Error sending mail");
          reject(error);
        } else {
          log.info("email sent", response.message);
          //console.log(JSON.stringify(response));
          resolve(response);
        }
      });
    });
  }

  return {
    sendWelcome: function(user) {
      return sendMessage(config.templates.signup, user);
    },

    resendVerification: function(user) {
      return sendMessage(config.templates.resend, user);
    },

    sendForgot: function(user) {
      return sendMessage(config.templates.forgot, user);
    },

    sendMessage: function(to, subject, templatePath, vars) {
      return sendMessage({
        to: to,
        subject: subject,
        templatePath: templatePath,
        templateVars: vars
      });
    }
  };
};
