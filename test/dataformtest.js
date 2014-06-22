var request = require('supertest');
var cheerio = require('cheerio');
var should = require('should');
var assert = require('assert');

var testdata = {
  "_id" : "testdata1",
  '__t' : 'test',
  'a string' : 'v',
  'foo\\' : { 'ba.r' : 'v' },
  'has[1]' : 'v',
  'nested' : { 'object' : {'value' : 1 } },
  'none' : null,
  'enabled' : true,
  'disabled' : false,
  'emptystring' : '',
  'array' : [0, 1],
  'objectSelection' : '@2',
  'labeledSelection' : 2,
  'simpleSelection' : 'two'
};

var simpleArray = ['one', 'two'];

var labeledArray = [{ 'value' : 1, 'label': 'once'}, { 'value' : 2, 'label': 'twice'},
   { 'value' : 3, 'label': 'three times'} ];

var objectArray = [{ "_id": "@1",
     "name":"option 1",
     "notes" : ["first"]
   },
   { "_id": "@2",
        "name":"option 2",
        "notes" : []
   }
];

var app = require('./fixtures/app')();

describe('dataform', function() {
  before(function(done) {
    app.get('/dataformtest.html', function (req, res) {
      res.render('dataformtest.html', {
          df : require("../lib/dataForm").dataform(),
          testdata : testdata,
          simpleArray : simpleArray,
          labeledArray : labeledArray,
          objectArray : objectArray
       });
    });

    app.start(function(listen) {
      listen(function(server){console.log('test app started'); done();});
    });
  });

  // remove users after test
  after(function(done){
      assert(app.get("server"));
      app.stop(done);
  });

  var count = 0;
  var body = null;

  it('should render stuff', function(done) {
      console.log('requesting');
      var url = app.getUrl();
      assert(url);
      request(url).get('/dataformtest.html')
      .expect(/<h2>Dataform test<\/h2>/)
      .expect(function(res) {
        body = res.text;
        assert(body);
        var $ = cheerio.load(body);
        $('div.testcase').each(function(){
          var testname = $(this).find('h4').text();
          //mocha requires all tests to be setup before the first process tick,
          //so unfortunately let's just log tests to console
          console.log('running dynamic dom test:', testname);
          var a = $(this).children('div.expect').html();
          var b = $(this).children('div.test').html();
          b.should.equal(a);
          count += 1;
        });
      }).end(done);
  });

  it('should have correct number of tests', function(done) {
    count.should.equal(30);
    done();//needs to be async to run after first test
  });
});
