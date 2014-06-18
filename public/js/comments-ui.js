//gTogglerClass '.show-hide-toggle' used by toggler elementsa on comments
var gTogglerClass = '.show-hide-toggle';

//toggle function for fixed-height displays with potentially large contents
function toggleDisplay(selector,singleRowHeight,bindType) {

	var display = $(selector);
	var toggler = display.find(gTogglerClass).first();
	display.css({'height':'auto'});//set height to auto    
	var fullHeight = display.height();//get full content height when auto
	display.css({'height':singleRowHeight});//now set height to one row
	if (display.height() >= fullHeight) {//only show toggler if full contents larger than 1 row
		toggler.css('visibility','hidden');
	} else {
		toggler.css('visibility','visible');
	}
}

function initDisplay() {

	// section-list comments
		$('.section-body.comments').each(function() {
		toggleDisplay($(this),'1.6rem','click');
	}); 

	$('.section-body > .comments-header').click(function() {
		$(this).closest('.section-body.comments').find(gTogglerClass).first().click();
	});

	// section-list comments replies
	$('.replies').each(function() {
		toggleDisplay($(this),'1.6rem','click');
	});
	$('.replies > .comments-header').click(function() {
		$(this).closest('.replies').find(gTogglerClass).click();
	});

}

function showComments(){
		$('show-hide-toggle').addClass('hover');
		$('div.comments').addClass('show-all');
}

function hideComments() {
		$('show-hide-toggle').removeClass('hover');
		$('div.comments').removeClass('show-all');
}

$(document).ready(function() {

  	initDisplay();
 
	function addComment(){
		// alert('adding comment');
		$('#create-comment').dbCreate(function(data){
		  console.log("comment created", data);
		  $('#comment-section').dbModel().comments.push(data);
		  $('#comment-section').dbRender();
		});
		//location.reload(true);  // temporary solution; should add comment to db and re-render comment list.
	}

	// on Click event for toggle comments 'views' 
	$('.show-hide-toggle').click(function(){
		if (!$(this).hasClass('hover')) {
			$(this).addClass('hover').closest('div').addClass('show-all');
		} else {
			$(this).removeClass('hover').closest('div').removeClass('show-all');
		}

	});

  $('.comment-entry-field').keyup(function() {

        var empty = false;
         if ($(this).val() == '') {
                empty = true;
         }

        if (empty) {
            $('#add-comment').addClass('disabled')
            $('#add-comment').unbind('click');
         } else {
            $('#add-comment').removeClass('disabled');
            $('#add-comment').unbind('click');
            $('#add-comment').bind('click', addComment);
         }
    });


});
