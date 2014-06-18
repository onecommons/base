// blogpost.js  route
var moment = require('moment');
var fs = require('fs');
var Item = require('../models/item');

// post detail
module.exports = function(req, res) {

  var theUser       = req.user;  // get the post and comments.
  var postItem      = {};
  var commentItems  = [];

  Item
    .find({ parent: '@post@'+req.params.id})
    .sort({modDate: 'desc'})
    .populate('creator')
    .exec(function(err,Items) {
      if(err) { console.log("MONGOOSE EXEC ERROR", err);}
      for(var i=0, n=Items.length; i < n; i++){

          switch(Items[i].__t) {
            case 'Post':
              postItem = Items[i];
              break;

            case 'Comment':
              commentItems.push(Items[i]);
              Items[i].ago = moment(Items[i].modDate).fromNow();
              break;

            /* other item types? NIY */
          }
      }
       // console.log(postItem, commentItems);
       var datestr = moment(postItem.modDate).format( "MMMM DD YYYY");
       commentItems.push(
        {
          _id: "@Comment@1",
          content: "hello world",
          ago: "asdfadsf",
          creator: {
            displayName: 'sue'
          }
        }
       )
       postItem.comments = commentItems
       res.render('blogpost.html', {
         messages: req.flash('info'),
         post: postItem,
         post_last_edit: datestr,
         user: theUser  // vile hack TRP to keep going.
     });

  }); // exec()

}