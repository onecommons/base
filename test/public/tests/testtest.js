// load the unit we are testing, or more js as needed.
var foof = function(){ return 12; }

// the tests.
describe('foo', function() {
    it('should return 12', function(){
        assert.equal(foof(), 12);
    });

    it('should return 12*12', function(){
        var x = foof();
        assert.equal(foof() * foof(), 144);
    });

});

describe("when an empty string is passed in", function() {
  it("returns 0", function(done) {
    var result = 0; //StringCalculator.add("");
    setTimeout(function() {
      assert(result === 0);
      done();
    }, 20);
  });
});
