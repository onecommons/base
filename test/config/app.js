module.exports = {
    dburl: "mongodb://127.0.0.1:27017/ocdemo-unittest",
    port: null, //don't specify a port so we can let the OS choose a free one
    cookie_secret: "unit tests rule!",
    logger: {
      type: 'simple',
      options: {
        level: 'fatal'
      }
    },
    requests: {
      logging: 'none'
    }
};
