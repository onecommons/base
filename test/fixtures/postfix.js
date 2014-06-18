// postfix.js

// some posts and comments to get the ball rolling on blogpost/comments page. 
// load this into mongodb with cmd line:

// mongo ocdemo --quiet postfix.js


// add a few users.
db.users.insert({ _id: '@user@100', displayName: 'Guy 100'});
db.users.insert({ _id: '@user@101', displayName: 'Guy 101'});
db.users.insert({ _id: '@user@102', displayName: 'Guy 102'});
db.users.insert({ _id: '@user@103', displayName: 'Guy 103'});
db.users.insert({ _id: '@user@104', displayName: 'Guy 104'});


// add blog posts and comments.
for(var j =1; j < 5; j++){

	db.items.insert({
		__t: 'Post', 
		_id:'@post@'+ j, 
		title:'title post'+j, 
		content: 'content post '+j, 
		parent: '@post@'+j,
		creator: '@user@100',
		creationDate: Date.now(),
		modDate: Date.now(),
		tags: ['good', 'bad', 'ugly']
	});

	for(var i=0; i< 3; i++){
		var id = j*100 + i;
		db.items.insert({
			__t: 'Comment',
			_id:'@comment@'+ id,
		    title:'title comment'+i+' on post '+j, 
			content: 'content comment'+i+' on post '+j,
		    parent: '@post@'+j,
		    creator: '@user@' + (100 + j),
		    creationDate: Date.now(),
		    modDate: Date.now()
		});
	}
}


/* results:

> db.items.find()
{ "_id" : "@post@1", "__t" : "post", "title" : "title post1", "content" : "content post 1", "parent" : "@post@1" }
{ "_id" : "@comment@100", "__t" : "comment", "title" : "title comment0 on post 1", "content" : "content comment0 on post 1", "parent" : "@post@1" }
{ "_id" : "@comment@101", "__t" : "comment", "title" : "title comment1 on post 1", "content" : "content comment1 on post 1", "parent" : "@post@1" }
{ "_id" : "@comment@102", "__t" : "comment", "title" : "title comment2 on post 1", "content" : "content comment2 on post 1", "parent" : "@post@1" }
{ "_id" : "@post@2", "__t" : "post", "title" : "title post2", "content" : "content post 2", "parent" : "@post@2" }
{ "_id" : "@comment@200", "__t" : "comment", "title" : "title comment0 on post 2", "content" : "content comment0 on post 2", "parent" : "@post@2" }
{ "_id" : "@comment@201", "__t" : "comment", "title" : "title comment1 on post 2", "content" : "content comment1 on post 2", "parent" : "@post@2" }
{ "_id" : "@comment@202", "__t" : "comment", "title" : "title comment2 on post 2", "content" : "content comment2 on post 2", "parent" : "@post@2" }
{ "_id" : "@post@3", "__t" : "post", "title" : "title post3", "content" : "content post 3", "parent" : "@post@3" }
{ "_id" : "@comment@300", "__t" : "comment", "title" : "title comment0 on post 3", "content" : "content comment0 on post 3", "parent" : "@post@3" }
{ "_id" : "@comment@301", "__t" : "comment", "title" : "title comment1 on post 3", "content" : "content comment1 on post 3", "parent" : "@post@3" }
{ "_id" : "@comment@302", "__t" : "comment", "title" : "title comment2 on post 3", "content" : "content comment2 on post 3", "parent" : "@post@3" }
{ "_id" : "@post@4", "__t" : "post", "title" : "title post4", "content" : "content post 4", "parent" : "@post@4" }
{ "_id" : "@comment@400", "__t" : "comment", "title" : "title comment0 on post 4", "content" : "content comment0 on post 4", "parent" : "@post@4" }
{ "_id" : "@comment@401", "__t" : "comment", "title" : "title comment1 on post 4", "content" : "content comment1 on post 4", "parent" : "@post@4" }
{ "_id" : "@comment@402", "__t" : "comment", "title" : "title comment2 on post 4", "content" : "content comment2 on post 4", "parent" : "@post@4" }

*/

