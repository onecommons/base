module.exports = {
  dburl: "mongodb://127.0.0.1:27017/ocdemo",
  port: 3000,
  address: 'localhost',
  cacheviews: false,
  //appurl: 'http://yourapp.com'
  //cookie_secret: 'your secret here',

  //sessionfactory: function(sessionconfig, app, session) { sessionconfig.store: new FileStore();},
  persistentSessionSeconds: 0, //"remember me" login option, to enable set to e.g:  60 * 60 * 24 * 30 (1 month)
  browsersessionSessionSeconds: 60 * 60 * 24 * 14, //2 weeks (how long a non-persisntent session lasts)

  defaultAdmin: { //null to disable creation of default admin user
    email: "admin@onecommons.org",
    password: "admin"
  },

/*
  //configure app.log and req.log
  logger: {
    type: 'simple' // default, or 'bunyan'

    options: {
      //name,
      level: 'info' // default
    }
  },

  //config how http requests are logged and instrumented
  requests: {
    // how to log requests
    // logging can be either a function, a string, or an object
    // If it's a string it specifies the type of logger to use.
    // If its a function is it invoked with the app as an argument
    logging: {
      type: "morgan", //default, or 'logger' or 'none'
      //(morgan options):
      morgan: {
        //format: 'dev'
      },

      //(logger options):
      logger: {
        //immediate_level: 'debug' //default, level to log immediate requests to
        //headers: false //default, log headers
      }
    },

    // set hideInternals flag on req as hint for how much information to disclose
    // externally (e.g. in error messages sent to the client)
    hideInternals: false,
  }
*/
};
