module.exports = {
    dburl: "mongodb://127.0.0.1:27017/ocdemo",
    port: 3000,
    cacheviews: false,
    //cookie_secret: 'your secret here',
    //sessionfactory: function(sessionconfig, app, session) { sessionconfig.store: new FileStore();},
    persistentSessionSeconds: 0, //"remember me" login option, to enable set to e.g:  60 * 60 * 24 * 30 (1 month)
    browsersessionSessionSeconds: 60 * 60 * 24 * 14//2 weeks (how long a non-persisntent session lasts)
}
