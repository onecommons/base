// jswigtest.js – test the jswig endpoint

var express			= require('express');
var request 		= require('supertest');
var assert			= require('chai').assert;
var path				= require('path');
var app = express();
app.get('/jswig/*', require('../routes/jswig')(app)); // add jswig routes to app.
app.set('views', __dirname + '/views');

describe('clientinclude', function() {
  //var consolidate = require('consolidate');
  var swig = require("swig")
  require('../lib/swigextensions')(swig);

  //var path = require('path');
  //app.set('views', path.join(__dirname, '/test/views'));
  app.engine('html', swig.renderFile);
  app.set('view engine', 'html');
  app.get('/test-clientinclude.html', function (req, res) {
    res.render('test-clientinclude.html', { foo: [
      { user: {_id: '3'} }
      , {_id:'1', nested: {_id: '2'}}
    ],
    bar: { user: {_id :'3', prop: 'a'},
          comments: [ {_id: '4', prop: 'b'}, {_id: '5'}]
      }
    });
  });

  it('should parse clientinclude tag correctly', function(done){
      request(app).get('/test-clientinclude.html')
        .expect('<html>\n<div id=\'dom1\'>\n<div>hello</div>\n\n\n</div>\n\n<div id=\'dom2\'>\n\n</div>\n\n<div id=\'dom3\'>\n\n</div>\n\n<div id=\'dom4\'>\n<div>hello</div>\n\n\n</div>\n\n\n<script>if (!$.templates) $.templates = {}</script><script async defer src=\'/jswig/partials/clientinclude.js\'></script>\n<script src="/js/swig.min.js"></script>\n\n<script>$.dbCache={"1":{"_id":"1","nested":{"_id":"2"}},"3":{"_id":"3","prop":"a"},"4":{"_id":"4","prop":"b"},"5":{"_id":"5"}};\n$(document).ready(function() {$.each({"dom1":{"template":"partials/clientinclude","model":[{"user":$.dbCache[\'3\']},$.dbCache[\'1\']]},"dom2":{"template":"partials/clientinclude","model":{"user":$.dbCache[\'3\'],"comments":[$.dbCache[\'4\'],$.dbCache[\'5\']]}},"dom3":{"template":"partials/clientinclude"},"dom4":{"template":"partials/clientinclude"}}, function(domid, model) {\n     $(\'#\'+domid).data(\'_template\', model.template);\n     $(\'#\'+domid).data(\'_model\', model.model);});\n});</script>\n\n\n</html>'
        , done);
  });
});

describe('jswig endpoint', function(){

	it('should get jswigtest-pass.js correctly', function(done){
		request(app)
			.get('/jswig/./partials/jswigtest-pass.js')
			.end(function(err, res){
				if(err){
					throw err;
					done();
				}
				assert.equal(res.status, 200);;
				done();
			});
	});

	it('should get jswigtest-pass correctly', function(done){
		request(app)
			.get('/jswig/./partials/jswigtest-pass')
			.end(function(err, res){
				if(err){
					throw err;
					done();
				}
				assert.equal(res.status, 200);;
				done();
			});
	});

	it('should give 500 error on malformed swig template', function(done){

		request(app)
			.get('/jswig/partials/jswigtest-fail')
			.end(function(err, res){
				// if(err){
				// 	throw err;
				// 	done();
				// }
				if(err){ console.log(err); }
				assert.equal(res.status, 500);
				done();
			});
	});

	it('should give 404 error if template isnt found', function(done){

		request(app)
			.get('/jswig/partials/some-jenky-file-that-doesnt-exist')
			.end(function(err, res){
				// if(err){
				// 	throw err;
				// 	done();
				// }
				assert.equal(res.status, 404);
				done();
			});
	});



});
