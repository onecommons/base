/* unused

// pin nav at top on scroll
var gNavNotAtTop;

$(window).scroll(function() { 
    var headerHeight = $('.page-header').outerHeight() - $('.nav').outerHeight();
    if ($(window).scrollTop() != 0) {
      if ($(window).scrollTop() > headerHeight) { 
        $('.nav').addClass('not-at-top');
        gNavNotAtTop = 1;        
      }
    } else {
        $('.nav').removeClass('not-at-top');
        gNavNotAtTop = 0;
    }
});
*/

//gTogglerClass '.show-hide-toggle' used by all expandable displays for toggler element
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
  if (bindType=='click') {  //bind click to toggle show/hide
    toggler.toggle(
        function() {
            $(this).addClass('hover')
              .closest(selector).addClass('show-all');
        },
        function() {
            $(this).removeClass('hover')
              .closest(selector).removeClass('show-all');
        }        
    );
    if (toggler.closest(selector).hasClass('show-all')) { // if class set in html
          toggler.addClass('hover').css({'visibility':'visible'}).click();
    }
  } else {                 //bind toggler hover to show all
    toggler.mouseenter(
        function() {
            display.addClass('show-all');
            $(this).addClass('hover');
        }
    );
    display.mouseleave(function() { //hide when mouse leaves display area
          $(this).removeClass('show-all');
          display.css({'height':singleRowHeight});
          toggler.removeClass('hover');
          return false;
      });
  }
  display.find('a').attr('tabindex','-1');//remove display links from tab order, to target tags only, use find('li a') 
  display.css('visibility','visible');//show element (to prevent flash)
}
function initDisplay() {
  // topics-display (header)
  toggleDisplay('.nav .topics-display','1.8rem','hover');

  // topics-display (section-box)
  $('.section-box .topics-display').each(function() {
      toggleDisplay($(this),'1.2rem','hover');
  });
  
  // topics-display (section-list)
  $('.section-list .topics-display').each(function() {
      toggleDisplay($(this),'1.3rem','click');
  });

  // section-toc
  $('.section-toc').each(function() {
      toggleDisplay($(this),'1.1rem','click');
  });
  // section-list comments
  $('.section-body.comments').each(function() {
      toggleDisplay($(this),'1.6rem','click');
  });
  //set section-list comments header and icon to toggle comments display
  $('.list-view .item-comments').click(function() {
      $(this).parents('.section-body').siblings('.comments').find(gTogglerClass).first().click();
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
  // sections in list view
  $('.section-list:not(.items-only)').each(function() {
      toggleDisplay($(this),'1.8rem','click');
    });
}
$(document).ready(function() {

/* unused
  // dynamic color gradient in topic-crumb
  var i = 0; 
  $('.topic-crumb li').each(function() {
        i++;
        $(this).addClass('c'+ i)
    })
    .parent().addClass('c'+ i)
    .css('visibility','visible');
*/

  initDisplay();
  
/* unused
  // toggle 'views' for demo
  $('.icon-view-grid').click(function(){
    if (!$(this).hasClass('active')) {
          $('.grid-view').show();
          $('.list-view').hide();
          $(this).addClass('active');
          $('.icon-view-list').removeClass('active');
          initDisplay();
      } 
    });
  $('.icon-view-list').click(function(){
    if (!$(this).hasClass('active')) {
          $('.grid-view').hide();
          $('.list-view').show();
          $(this).addClass('active');
          $('.icon-view-grid').removeClass('active');
          initDisplay();
      }
    });
*/
});