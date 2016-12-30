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
    var transport = cfg.transport;
    if (typeof cfg.transport == 'string') {
      var transportModule = {
          'stub': 'nodemailer-stub-transport',
          'smtp': 'nodemailer-smtp-transport',
        }[cfg.transport.toLowerCase()] || cfg.transport;
      transport = require(transportModule);
    }
    return nodemailer.createTransport(transport(cfg.config || {}));
  }

  function sendTemplate(data) {
    var mandrill = require('mandrill-api/mandrill');

    var message = {
      from_email: data.from,
      to: [{email: data.to}],
      subject: data.subject,
      merge_language: data.merge_language,
      global_merge_vars: _.map(data.vars, function(value, key) {return {name:key.toUpperCase(), content:value}})
    };

    var mandrillClient = new mandrill.Mandrill(config.templateApiKey);
    return new Promise(function(resolve, reject) {
      mandrillClient.messages.sendTemplate({
        template_name: data.templateName,
        template_content: [],
        message: message,
        async: true,
        // "ip_pool": ip_pool, "send_at": send_at
      }, resolve, reject);
    }).then(function(result){
      log.info("email template sent", result);
    }, function(error){
      log.error(error, "Error sending mail template");
    });
  }

  function sendMessage(template, user, vars) {
    var appurl = app.getExternalUrl();
    var emailVars = _.defaults(vars || {}, template.templateVars || {}, config.templateVars || {}, {
      'appurl': appurl,
      'settings': app.config.settings
    });
    // XXX should use route resolution fns
    if (user && user.local.signupToken) {
      emailVars.signupLink = appurl + "/verification/" + user.local.signupToken;
    }
    if (user && user.local.resetToken) {
      emailVars.resetLink = appurl + "/forgot/" + user.local.resetToken;
    }

    var msgSubject = swig.render(template.subject, {locals:emailVars});

    var message = {
        from: config.from,
        to: template.to || user.local.email,
        subject: msgSubject,
        html: msgBody,
    };

    if (template.templatePath && template.templateName) {
      throw new Error("mail template configuration error: templatePath and templateName cannot both be set");
    }

    if (template.templatePath) {
      var msgBody = swig.renderFile(template.templatePath, emailVars);
      message.html = msgBody;
      message.generateTextFromHTML = true;

      var transport = createTransport();

      return new Promise(function(resolve, reject) {
        transport.sendMail(message, function(error, response) {
          transport.close(); // shut down the connection pool, no more messages

          if (error) {
            log.error(error, "Error sending mail");
            reject(error);
          } else {
            log.info("email sent", response);
            resolve(response);
          }
        });
      });
    } else {
      message.vars = emailVars;
      message.templateName = template.templateName;
      message.merge_language = template.merge_language || "mailchimp";
      return sendTemplate(message);
    }
  }

  return {
    config: config,

    sendWelcome: function(user) {
      return sendMessage(config.templates.signup, user);
    },

    resendVerification: function(user) {
      return sendMessage(config.templates.resend, user);
    },

    sendForgot: function(user) {
      return sendMessage(config.templates.forgot, user);
    },

    sendToUser: function(template, user, vars) {
      return sendMessage(
        typeof template === 'string' ? config.templates[template] : template,
        user, vars);
    },

    sendMessage: function(to, subject, templatePath, vars) {
      return sendMessage({
        to: to,
        subject: subject,
        templatePath: templatePath,
        templateVars: vars
      });
    },

    sendTemplate: function(to, subject, templateName, vars) {
      return sendMessage({
        to: to,
        subject: subject,
        templateName: templateName,
        templateVars: vars
      });
    }
  };
};
