// directory.js routes for the directories

//
// Directory
//

var testProjects = [];
for(var j =0; j < 6; j++){
	testProjects[j] = {
		"id": j
    	,"name":"Namey Name Name"
	    ,"description": "Etsy iPhone jean shorts, master cleanse try-hard Neutra asymmetrical crucifix. Letterpress banh mi meggings VHS cornhole, 3 wolf moon Williamsburg Truffaut small batch art party Helvetica dreamcatcher tofu locavore narwhal. Craft beer Neutra banjo."
	}
}

var testCategories = [];
for(var i =0; i < 5; i++){
	testCategories[i] = {
		"name": "Category " + i
		,"url": "cause" + i
	}
}


module.exports.fullDirectory = function(req, res) {
  res.render('index.html', {
    directoryItems : testProjects
    ,categories : testCategories

  });
}


//
// Directory Item
//

var	testProject = {
		"id": 1
    	,"name":"Namey Name Name"
    	,"url":"test-project"
    	,"description":"Letterpress banh mi meggings VHS cornhole, Letterpress banh mi meggings VHS cornhole, Letterpress banh mi meggings VHS cornhole, Letterpress banh mi meggings VHS cornhole, Letterpress banh mi meggings VHS cornhole, Letterpress banh mi meggings VHS cornhole, Letterpress banh mi meggings VHS cornhole."
	}

module.exports.directoryItem = function(req, res) {
  res.render('directory-item.html', {
    directoryItem : testProject
  });
}
