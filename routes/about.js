// about.js  route

// Render 'about' static pages
module.exports = function(req, res) {
  console.log("handling about pagename= ", req.params.pagename);
  res.render(req.params.pagename, {});
}
