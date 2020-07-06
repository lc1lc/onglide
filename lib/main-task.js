/* Copyright(c)2007-2014, Melissa Jenkins.  All rights reserved */

var iconR, iconG, iconB;

var normalPathOptions = { strokeColor: '#222', strokeWeight: 1,  strokeOpacity: 0.5, zIndex: 10 };
var selectedPathOptions = { strokeColor: '#600', strokeWeight: 6, strokeOpacity: 0.7, zIndex: 20 };
var scoredPathOptions = { strokeColor: '#060', strokeWeight: 10,  strokeOpacity: 0.8, zIndex: 19 };

var _2pi = Math.PI*2;

//
// initialise a GoogleMap Object with the appropriate task and setup the callbacks
// based on if flying is active or not
//
function initialise( className, dateCode, taskNumber, today, flightsAvailable, minspeed, maxspeed, competitors, tzoffset, satellite, compno, score )
{
    if( ! taskNumber ) {
        taskNumber = '';
    }

    // figure out what map we have and how we are going to work with it
    var mapObject = new  google.maps.Map(  document.getElementById("map"+className+taskNumber), {
        zoom: 11,
        mapTypeId: satellite ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.TERRAIN,
	scaleControl: true,
    } );
    document.getElementById("map"+className+taskNumber).og_mapObject = mapObject;

    // store what we need to in the map object so we can access it later
    mapObject.og_className = className;
    mapObject.og_dateCode = dateCode;
    mapObject.og_taskNumber = taskNumber;
    mapObject.og_taskoverlays = [];

    mapObject.og_flightsAvailable = flightsAvailable;
    mapObject.og_listeners = [];
    mapObject.og_compnoIcons = [];

    mapObject.og_minspeed = minspeed;
    mapObject.og_maxspeed = maxspeed;
    mapObject.og_competitors = competitors;
    mapObject.og_tzoffset = tzoffset;
    mapObject.og_progressoverlays = [];
    mapObject.og_today = today;
    mapObject.og_highesthandicap = 100;
    mapObject.og_firstTime = 1;
    mapObject.og_restartbackoff = 100;

    if( compno ) {
	mapObject.og_compno = compno;
    }

    // Array of all the trackers we have received
    mapObject.og_trackers = {};
    mapObject.og_glidermarkers = {};

    console.log( dateCode+"&&"+taskNumber+"&&"+mapObject.og_today );

    // display the stuff we want displayed...
    if( dateCode && taskNumber && mapObject.og_today != -1 ) {
	
	// when it was last updated
        mapObject.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(document.getElementById('updated'));

        // download the task and if needed update progress/results
	document.getElementById("updated").innerHTML = "Loading task...";
        refreshDisplay( mapObject );

        if( typeof ResultsDisplay === 'function' ) {
            // If it is for a day with results then we need to display these results
            mapObject.results = new ResultsDisplay( mapObject, '#collapse'+className+"results" );
        }


	// Allow unit changes
	mapObject.controls[google.maps.ControlPosition.TOP_RIGHT].push(document.getElementById('unitstoggle'));
	if( isOptionSet( 'units', 1 )) {
	    console.log( "unit set to feet" );
	    mapObject.og_units = 1;
	    $('.unit0').hide();
	    $('.unit1').show();
	} else {
	    console.log( "unit set to m" );
	    mapObject.og_units = 0;
	    $('.unit0').show();
	    $('.unit1').hide();
	}

	// Get the sponsors ready
	$('slogo').hide();
	$('#sponsorlogo0').show();
        mapObject.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(document.getElementById('sponsorslogos'));


        if( today ) {

            // Make an add  - we defer this till it is requested to reduce server and client load
            var coverageOverlay;
            function addCoverageOverlay() {
                mapObject.og_coverage = coverageOverlay = new CoverageMapType(new google.maps.Size(256, 256), mapObject );
                coverageOverlay.setColourScheme( '#0000ff20:#0000ff50' );
                coverageOverlay.setSource( 'coverage' );
                mapObject.overlayMapTypes.insertAt(0, coverageOverlay );
            }

            // Defer on options
	    if(1) {
            if( isOptionSet( 'coverageOverlay', 1 ) ) {
                addCoverageOverlay();
            }

	    // Add the controls to the map
            mapObject.controls[google.maps.ControlPosition.TOP_RIGHT].push(document.getElementById('coveragetoggle'));

            // Capture the clicks and togge the overlays
            document.getElementById('ctoggle').onclick = function() {
                if( ! mapObject.og_coverage ) {
                    addCoverageOverlay();
                }
                else if( mapObject.overlayMapTypes.getAt(0) == coverageOverlay ) {
                    mapObject.overlayMapTypes.removeAt(0);
                    setOption('coverageOverlay', 0 );
                }
                else {
                    setOption('coverageOverlay', 1 );
                    mapObject.overlayMapTypes.insertAt(0, coverageOverlay );
                }};

	    }
	}
	
        // We don't bother defering rain as it is very light weight
        if( RainOverlay && tzoffset == 3600 ) {
            mapObject.og_rain = new RainOverlay( mapObject, isOptionSet( 'rainOverlay', 1 ));
	    
            mapObject.controls[google.maps.ControlPosition.TOP_RIGHT].push(document.getElementById('raintoggle'));
            mapObject.controls[google.maps.ControlPosition.RIGHT_TOP].push(document.getElementById('raintime'));
        }
	
	
        // Live rain rather than delayed
        if( mapObject.og_replay ) {
            mapObject.og_rain.setReplay();
        }
	
        document.getElementById('rrtoggle').onclick = function() {
            if( ! mapObject.og_rain ) { return }
            if( mapObject.og_rain.getMap() != null ) {
                mapObject.og_rain.setMap(null);
                setOption('rainOverlay',0);
            } else {
                setOption('rainOverlay',1);
                mapObject.og_rain.setMap(mapObject);
            }};
	
	// Display elevations in M rather than FT
	document.getElementById('utoggle').onclick = function() {
	    console.log( "option set" + isOptionSet('units',0));
	    if( isOptionSet( 'units', 0 )) {
                setOption('units',0);
		$('.unit0').show();
		$('.unit1').hide();
		mapObject.og_units=0;
		resetMinMax(mapObject.og_trackers);
		drawAllTrackers( mapObject, mapObject.og_trackers );
	    }
	    else {
                setOption('units',1);
		$('.unit0').hide();
		$('.unit1').show();
		mapObject.og_units=1;
		resetMinMax(mapObject.og_trackers);
		drawAllTrackers( mapObject, mapObject.og_trackers );
	    }};
    }

    // Allow boxes to be resized, and setup defaults
    $('#mirror').css('margin-left',0).css('padding-left',30);
    $('ul.pilots').css('width','100%');
    $('.googlemap').css('height',$('#resizable').innerHeight());
    
    //if($('.row-fluid').innerWidth()>992) {
	$( "#resizable" ).resizable({ maxWidth: $('.row-fluid').innerWidth()-250,
				      stop: function(event,ui) { console.log( "resize stop" );
								 $('ul.pilots').css('width','100%');
								 $('.googlemap').css('height',$('#resizable').innerHeight());
								     google.maps.event.trigger(mapObject, "resize"); } });
    //}
    
    $( window ).resize(function() {
	if($('.row-fluid').innerWidth()<=992){
	    $('.span6').css('width','100%');
	    $( "#resizable" ).resizable({ disabled: true });
	}
	else {
	    if($("#resizable").innerWidth()===$('.row-fluid').innerWidth())	{
		$('.span6').css('width','');
	    }
	    $( "#resizable" ).resizable({ disabled: false, maxWidth: $('.row-fluid').innerWidth()-300 });
	    $('#mirror').css('width', Math.floor($('.row-fluid').innerWidth() -  $( "#resizable" ).innerWidth() - 50 ));
	}
    });

    // If we are in a frame then hide the menu
    if( window.top != window ) {
	$(".navbar-fixed-top").hide(1000);
	google.maps.event.trigger(mapObject, "resize");
    }

    return mapObject;
}

function resetMinMax(trackers) {
    for( var key in trackers ) {
        var existingTracker = trackers[key];
        existingTracker.min = 999999999999;
	existingTracker.max = 0;
    }
}


function toggleRain() {
}


// do the logic of updating the display - all done in the background
function refreshDisplay( mapObject ) {
    console.log( "refreshDisplay" );
    if( ! mapObject.og_task ) {
        fetchTask( mapObject );
    }
    else if( mapObject.og_firstTime ) {
	document.getElementById("updated").innerHTML = "<i class='icon-spinner icon-spin '></i>&nbsp;Loading and scoring tracks...";
        fetchProgress( mapObject );
    }
    else if( mapObject.og_today ) {
        streamProgress( mapObject );
    }
    else {
	$('#updated').hide();
    }

    if( mapObject.og_refreshTimeout ) {
	clearTimeout( mapObject.og_refreshTimeout );
    }
    mapObject.og_refreshTimeout = setTimeout( function() { refreshDisplay( mapObject ); }, 65000 ); // every 65 seconds
}

function fetchTask( mapObject ) {

    $.ajax( { type: "GET", url: "maps-fetch-task.json?class="+mapObject.og_className+"&datecode="+mapObject.og_dateCode+
              "&task="+mapObject.og_taskNumber, timeout:8000,
              dataType: "json",
	      cache: true,
              error: function (xhr, ajaxOptions, thrownError) {
                  setTimeout( function() { refreshDisplay( mapObject ); }, 1 *60000 ); // every minute
              },
              success: function(json) {
                  mapObject.og_task = json;
                  drawTaskMap( mapObject );
                  zoomystuff( mapObject, mapObject.og_taskbounds );
		  refreshDisplay( mapObject );
              }
            });
}

function setTask( mapDiv, taskObject ) {
    mapDiv.og_mapObject.og_task = taskObject;
    drawTaskMap( mapDiv.og_mapObject );
}

function streamProgress( mapObject ) {

    if( ! mapObject.og_today ) {
	return;
    }

    // If we haven't received a keep alive then we should cleanup
    if( ! mapObject.og_keepalive_received && mapObject.socket ) {
	mapObject.socket.close();
	mapObject.socket = undefined;
	console.log( "host: "+host + ", keepalive not received - reconnecting" );
	
    }
    mapObject.og_keepalive_received = 0;
    
    if( ! mapObject.socket ) {

	// Make sure we haven't tried to reconnect too often
	mapObject.og_reconnects++;
	if( mapObject.og_reconnects > 7 ) {
	    document.getElementById("updated").innerHTML = "<i class='icon-exclamation-sign'></i><b>Unable to stream, please reload page</b>";
	    return;
	}

	var host = window.location.hostname.match( /^([A-Z0-9_-]+)/i )[1];
	console.log( "host: "+host );

	// Indicate that we are starting the stream on the map and figure out where to
	// get it from
	document.getElementById("updated").innerHTML = "<i class='icon-spinner icon-spin '></i>&nbsp; Waiting for stream to start...";
	mapObject.socket = new WebSocket( (window.location.protocol === "https:" ? "wss:" : "ws:") + "//"+
					  window.location.hostname + "/" + 
					  (host+mapObject.og_className+mapObject.og_dateCode).replace(/[^A-Za-z0-9]/gi,'').toUpperCase() );

	console.log( "establishing websocket to " + (window.location.protocol === "https:" ? "wss:" : "ws:") + "//"+
					  window.location.hostname + "/" + 
		     (host+mapObject.og_className+mapObject.og_dateCode).replace(/[^A-Za-z0-9]/gi,'').toUpperCase() + ", backoff: " + mapObject.og_restartbackoff);

	// If we get data
	mapObject.socket.onmessage = function(event) {
	    incomingData( mapObject, event.data );
	};

	mapObject.socket.onopen = function(event) {
	    mapObject.og_restartbackoff = 100;
	    mapObject.og_reconnects = 0;
	}

	// Handle an error by clearing up the existing one
	mapObject.socket.onerror = function (error) {
	    document.getElementById("updated").innerHTML = "<i class='icon-spinner icon-spin'></i>&nbsp; Restarting stream...";
	    console.log('WebSocket Error ' + error);
	    mapObject.socket = null;

	    // If we are more than 60 seconds then the normal routing will pick it up so we don't care
	    if( mapObject.og_restartbackoff < 100001 ) {
		setTimeout( function() {
		    streamProgress( mapObject );
		}, mapObject.og_restartbackoff *= 10 );
	    }
	    else {
		document.getElementById("updated").innerHTML = "<i class='icon-exclamation-sign'></i>&nbsp;Restart failure, please reload page...";
		mapObject.og_today = 0; // perhaps a better plan would have been a new variable but chances are reasonable this is occuring as the day has passed
	    }

	    return;
	};

    }
}

function chunkProgress( mapObject, range ) {

    if( ! mapObject.og_firstTime ) {
	return;
    }

    if( ! range.total ) {
	document.getElementById("updated").innerHTML = "<i class='icon-time'></i>&nbsp;No tracks";
	mapObject.og_firstTime = 0;
	setTimeout( function() {
	    refreshDisplay( mapObject );
	}, 10 );
	return;
    }

    var chunkSize = 1200;
    function roundDown( x ) { return x - (x%chunkSize); }
    function roundUp( x ) { return x - (x%chunkSize) + chunkSize; }
    function next(x) { return Math.min( x + chunkSize, range.latest ); }
    function prev(x) { return Math.max( x - chunkSize, range.earliest ); }

    var current = roundDown(range.latest);
    if( ! range.original ) {
	range.original = range.latest;
	document.getElementById("updated").innerHTML = "<i class='icon-spinner icon-spin '></i>&nbsp;<span id='percentloaded'>0%</span> Loaded";
    }
        
    
    $.ajax( { type: "GET", url: "maps-fetch-trackpoints.json",
	      data: { class: mapObject.og_className, from: current, to: range.latest },
              timeout:20000,
              dataType: "json",
	      cache: true,
              error: function (xhr, ajaxOptions, thrownError) {
		  document.getElementById("updated").innerHTML = "<i class='icon-exclamation-sign'></i>&nbsp; error loading historical data";
                  setTimeout( function() { chunkProgress( mapObject, range ); }, 60000 );
              },
              success: function(json) {
		  console.log( "loaded "+current + " to " + range.latest );
		  processChunk( mapObject, json );
		  
		  if( prev(current) <= range.earliest ) {
		      document.getElementById("updated").innerHTML = "<i class='icon-spinner icon-spin '></i>&nbsp;Scoring tracks...";
		      setTimeout( function() { 
			  drawAllTrackers( mapObject, mapObject.og_trackers );
			  // it is no longer our first time so don't fetch everything again
			  mapObject.og_firstTime = 0;
			  console.log( 'completed load' );
			  refreshDisplay( mapObject );
		      }, 10 );
		  }
		  else {	
		      document.getElementById("percentloaded").innerHTML = (100-Math.round((current-range.earliest)*100/(range.original-range.earliest))) + "%";
		      range.latest = current-1;
		      current = prev( current );
		      
		      setTimeout( function() { chunkProgress( mapObject, range ); }, 10 );
		  }
              }
            });
}    

function fetchProgress( mapObject ) {
    $.ajax( { type: "GET", url: "maps-fetch-livedata.json?class="+mapObject.og_className+"&datecode="+mapObject.og_dateCode+
              "&task="+mapObject.og_taskNumber+"&firsttime="+mapObject.og_firstTime, timeout:60000,
              dataType: "json",
	      cache: true,
              error: function (xhr, ajaxOptions, thrownError) {
                  //                            alert(xhr.status);
                  //alert(thrownError);
//		  alert( "failed to fetch live data, timeout or error" + thrownError + "," + xhr.status );
                  setTimeout( function() { fetchProgress( mapObject ); }, 3 *60000 ); // every minute
              },
              success: function(json) {
		  // Correct all the stored tracker data, on first call do points
		  loadAllTrackers( mapObject, json.trackers );
		  chunkProgress( mapObject, json.range );
//                  updateProgress( mapObject, json );
              }
            });
}

function load() {
}


function createCompnoMarker( map, compno, point ) {
    var marker;
    if( map.og_glidermarkers[compno] ) {
        marker = map.og_glidermarkers[compno];
        marker.setPosition( point );
    }
    else {
        marker = map.og_glidermarkers[compno] = new google.maps.Marker( {
            position: point,
            map: map,
            icon: { anchor: new google.maps.Point( 16, 22 ),
                    scaledSize: new google.maps.Size( 34, 22 ),
                    origin: new google.maps.Point( 0, 0 ),
                    url: "/perl/dynamiccompno.png?cb=green&ct=white&compno="+compno }
        });

        // We want to be able to adjust these without doing a full redraw
        marker.points = new google.maps.MVCArray;
        marker.scoredpoints = new google.maps.MVCArray;
        marker.lastpointadded = 0; // time of last point in the points MVC array so we don't have to redo it all
	marker.firstpointadded = undefined;
        marker.old = false;
        marker.paths = [];
    }

    return marker;
}

function setCompnoMarkerOld( map, compno ) {
    var marker;
    if( ! map.og_glidermarkers[compno] ) {
        return;
    }
    marker.setIcon( "/perl/dynamiccompno.png?tc=grey&compno="+compno );
    marker.old = true;
}

// This function will indicate missing points on the path and start a new path
function splitPath( map, marker ) {

    // If we have an undrawn path then make a poly line for it
    if( marker.points.length > 2 && ! marker.overlay ) {
        marker.overlay = new google.maps.Polyline( {    path: marker.points,
                                                        strokeColor: '#222',
                                                        strokeWeight: 1,
                                                        strokeOpacity: 0.5 });
        marker.overlay.setMap( map );
    }

    // Save them all away
    if( marker.overlay ) {
        //      marker.setOptions( { icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10 }, offset: '100%' }] } );
        marker.paths.push( marker.overlay );
        marker.overlay = null;
    }

    // Reset
    marker.points = new google.maps.MVCArray();
}

// This function will indicate missing points on the path and start a new path
function resetPath( marker ) {

    // Save them all away
    if( marker.overlay ) {

	marker.paths.forEach( function(p) {
            p.setMap( null );
        });
	marker.paths = [];

	marker.overlay.setMap(null);
	marker.overlay.clear();
        marker.overlay = null;
    }

    // Reset
    marker.points = new google.maps.MVCArray();
}

function updateCompnoMarker( map, compno, old, climbing ) {
    var marker;
    if( ! map.og_glidermarkers[compno] ) {
        return;
    }

    marker = map.og_glidermarkers[compno];
    if( ! marker.mouseoverlistener ) {
        marker.mouseoverlistener = google.maps.event.addListener(marker,'mouseover', function() { if( map.results ) { map.results.displayPilot( compno ); } showTooltip(map,marker); } );
        marker.mouseoutlistener =  google.maps.event.addListener(marker,'mouseout', function() { if( map.results ) { map.results.hidePilot(); } hideTooltip(map,marker);} );
    }

    if( marker.points.length > 2 && ! marker.overlay ) {
        // Normal track - this should be displayed
        marker.overlay = new google.maps.Polyline( { path: marker.points } );
        marker.overlay.setOptions( normalPathOptions );
        marker.overlay.setMap( map );
    }
    else if( marker.points.length <= 2 && marker.overlay ) {
        marker.overlay.setMap(null);
        marker.overlay = null;
    }

    if( marker.scoredpoints.length >= 2 && ! marker.scoredoverlay ) {
        // Overlay for scoring - only displayed on tooltip show
        marker.scoredoverlay = new google.maps.Polyline( {      path: marker.scoredpoints } );
        marker.scoredoverlay.setOptions( scoredPathOptions );
    }
    else if( marker.scoredpoints.length < 2 && marker.scoredoverlay ) {
        marker.scoredoverlay.setMap(null);
        marker.scoredoverlay = null;
    }

    // If we have plotted a point it's probably not old
    if( old )  {
        if( ! marker.old ) {
            marker.setIcon( "/perl/dynamiccompno.png?ct=grey&compno="+compno );
        }
        marker.old = true;
        // We need to break the path as well
    }
    else {
        if( marker.old ) {
            marker.setIcon( "/perl/dynamiccompno.png?cb=green&ct=white&compno="+compno );
        }
        marker.old = false;
    }
}


// create a dynamic marker based on the number iconns
function createTPMarker( map, point, number, description ) {
    var marker = new google.maps.Marker( {
        position: point,
        map: map,
        shadow: { url: "/globalimages/markers/markertpshadow.png",
                  scaledSize: new google.maps.Size( 20, 20 ),
                  origin: new google.maps.Point( 0, 0 ),
                  anchor: new google.maps.Point( 10, 9 ) },
        icon: { anchor: new google.maps.Point( 10, 10 ),
                scaledSize: new google.maps.Size( 18, 18 ),
                origin: new google.maps.Point( 0, 0 ),
                url: "/globalimages/markers/marker" + number + ".png"  }
    });

    //  google.maps.events.addListener( marker, "click", function() {
    //          map.showMapBlowup( point, {zoomLevel:12} );
    //  });

    marker.tooltip=description;
    //  map.addOverlay( marker );
    map.og_listeners.push( google.maps.event.addListener(marker,'mouseover', function() {showTooltip(map,this);} ));
    map.og_listeners.push( google.maps.event.addListener(marker,'mouseout', function() {hideTooltip(map,this);}) );

    map.og_taskoverlays.push( marker );
    //  console.log( marker );
}


//              createPilotMarker( map, ltlg, lopo[i].compnos, mIcon );

function createPilotMarker( map, point, tooltip, mIcon ) {
    if( typeof mIcon === 'undefined' ) {
        mIcon = 'red';
    }

    var marker = new google.maps.Marker( {
        position: point,
        map: map,
        shadow: { url: "/globalimages/markers/marker_shadow.png",
                  scaledSize: new google.maps.Size( 22, 20 ),
                  size: new google.maps.Size( 30, 30 ),
                  origin: new google.maps.Point( 0, 0 ),
                  anchor: new google.maps.Point( 6, 20 ) },
        icon: { anchor: new google.maps.Point( 6, 20 ),
                scaledSize: new google.maps.Size( 12, 20 ),
                size: new google.maps.Size( 18, 30 ),
                origin: new google.maps.Point( 0, 0 ),
                url: "/globalimages/markers/marker"+ mIcon + ".png"  }
    });


    if( tooltip ) {
        marker.tooltip=tooltip;

        var infowindow = new google.maps.InfoWindow( {
            content: tooltip } );
        var infoWindowOpen = false;

        map.og_listeners.push( google.maps.event.addListener(marker,'mouseover', function() {
            infowindow.open(map,marker);
        }));
        map.og_listeners.push( google.maps.event.addListener(marker,'mouseout', function() {
            infowindow.close();
        } ));
    }

    map.og_progressoverlays.push( marker );
    return marker;
}

function ToolTipOverlay(point, text, map) {

    // Now initialize all properties.
    this.point_ = point;
    this.text_ = text;
    this.map_ = map;

    // We define a property to hold the image's
    // div. We'll actually create this div
    // upon receipt of the add() method so we'll
    // leave it null for now.
    this.div_ = null;

    // Explicitly call setMap() on this overlay
    this.setMap(map);
}

ToolTipOverlay.prototype = new google.maps.OverlayView();


ToolTipOverlay.prototype.onAdd = function() {

    // Note: an overlay's receipt of onAdd() indicates that
    // the map's panes are now available for attaching
    // the overlay to the map via the DOM.

    // Create the DIV and set some basic attributes.
    var div = document.createElement('div');
    div.style.border = "none";
    div.style.borderWidth = "0px";
    div.style.position = "absolute";
    div.className='maps-tooltip';

    div.innerHTML = this.text_;

    // Set the overlay's div_ property to this DIV
    this.div_ = div;

    // We add an overlay to a map via one of the map's panes.
    // We'll add this overlay to the overlayImage pane.
    var panes = this.getPanes();
    panes.floatPane.appendChild(div);
};


ToolTipOverlay.prototype.draw = function() {

    // Size and position the overlay. We use a southwest and northeast
    // position of the overlay to peg it to the correct position and size.
    // We need to retrieve the projection from this overlay to do this.
    var overlayProjection = this.getProjection();

    // Retrieve the southwest and northeast coordinates of this overlay
    // in latlngs and convert them to pixels coordinates.
    // We'll use these coordinates to resize the DIV.
    var sw = overlayProjection.fromLatLngToDivPixel(this.point_);

    // Resize the image's DIV to fit the indicated dimensions.
    var div = this.div_;
    div.style.left = sw.x + 'px';
    div.style.top = sw.y + 'px';
};

ToolTipOverlay.prototype.onRemove = function() {
    this.div_.parentNode.removeChild(this.div_);
    this.div_ = null;
};

// Note that the visibility property must be a string enclosed in quotes
ToolTipOverlay.prototype.hide = function() {
    if (this.div_) {
        this.div_.style.visibility = "hidden";
    }
};

ToolTipOverlay.prototype.show = function() {
    if (this.div_) {
        this.div_.style.visibility = "visible";
    }
};

// Show the tool tip - normally done on marker hover
function showTooltip(map, marker) {

    var text;
    if( marker.points && marker.overlay ) {
        marker.overlay.setOptions( selectedPathOptions );
    }
    if( marker.scoredpoints && marker.scoredpoints.length ) {
        if( marker.scoredoverlay ) {
            marker.scoredoverlay.setMap( map );
        }
    }

    if( marker.paths ) {
        marker.paths.forEach( function(p) {
            p.setOptions( selectedPathOptions );
        });
    }

    //    map.og_currenttooltip = new ToolTipOverlay( marker.getPosition(), text, map );
    map.og_currentmarker = marker;

}

function showTrack(map, compno) {
    if( map.og_glidermarkers[compno] ) {
        map.lastMarkerZ = map.og_glidermarkers[compno].getZIndex();
        map.og_glidermarkers[compno].setZIndex(500);
        //      map.lastMarkerIcon = map.og_glidermarkers[compno].getIcon();
        //      map.og_glidermarkers[compno].setIcon( "/perl/dynamiccompno.png?tc=white&cb=maroon&compno="+compno );
        showTooltip( map, map.og_glidermarkers[compno] );
    }
}

function hideTrack(map, compno) {
    if( map.og_glidermarkers[compno] ) {
        map.og_glidermarkers[compno].setZIndex(map.lastMarkerZ);
        //      map.og_glidermarkers[compno].setIcon( map.lastMarkerIcon );
        hideTooltip( map, map.og_glidermarkers[compno] );
    }
}

// Revert back and hide
function hideTooltip(map,marker) {
    if( marker.overlay ) {
        marker.overlay.setOptions( normalPathOptions );
    }
    if( marker.scoredoverlay ) {
        marker.scoredoverlay.setMap( null )
    }
    if( map.og_currenttooltip ) {
        map.og_currenttooltip.setMap(null);
        map.og_currenttooltip = null;
    }

    if( marker.paths ) {
        marker.paths.forEach( function(p) {
            p.setOptions( normalPathOptions );
        });
    }

    map.og_currentmarker = null;
};

// Get rid of all of them
function hideMarkers(map) {
    if( map.og_currentmarker ) {
        hideTooltip( map, map.og_currentmarker );
    }
};

function zoomystuff(map,bounds) {
    var center = bounds.getCenter();
    var nZoom = map.fitBounds(bounds);
    if (map.getZoom() == nZoom) {
        map.panTo(center);
    } else {
        map.setCenter(center, nZoom);
    }
}

// used when cleaning up the map for redisplay
function removeListeners( map ) {
    // remove all the old listeners as we're not using them any more
    for( var p = 0; p < map.og_listeners.length; p++ ) {
        google.maps.event.removeListener( map.og_listeners[p] );
    }
    map.og_listeners = [];
}


//
// Update the map - display Landouts etc
function updateProgress( map, data ) {

    // remove the display of everything
    var taskbounds = new google.maps.LatLngBounds;
    var progressbounds = new google.maps.LatLngBounds;
    var llbounds = new google.maps.LatLngBounds;

    // if the task has changed then we will need to reload task
    if( data.task != map.og_taskNumber ) {
        map.og_taskNumber = data.task;
        return;
    }

    var o;
    while( o = map.og_progressoverlays.pop() ) {
        o.setMap(null);
    }
    hideMarkers(map);
    removeListeners(map);

    if( data.trackers ) {

	// Correct all the stored tracker data, on first call do points
        drawAllTrackers( map, data.trackers );

	// it is no longer our first time so don't fetch everything again
	map.og_firstTime = 0;

    }
    // process landouts
    var lopo =  data.lopos;

    var c = 0;

    for ( var i = 0; i < lopo.length;i++ ) {
        /*                              MIN(FIND_IN_SET(status, 'H,A,L,O,C,R')) wstatus, */
        var wstatus = parseInt(lopo[i].wstatus);
        var mIcon = "red";

        if( wstatus == 1 ) { /* home = green */
            mIcon = "green";
        }
        if( wstatus == 2 || wstatus == 3 || wstatus == 4 ) { /* linked, aerotow, or returning */
            mIcon = "blue";
        }

        var ltlg = new google.maps.LatLng(parseFloat(lopo[i].lat),
                                          parseFloat(lopo[i].lng));

        llbounds.extend( ltlg );

        createPilotMarker( map, ltlg, lopo[i].compnos, mIcon );

        c = c+1;
    }


    // draw a series of lines, one for each start time
    // only display if we have the information
    var starts = data.starts;
    if( starts ) {

        // WHERE DO WE THINK THEY'LL BE...

        // 1. determine how long they have been flying
        // 2. figure out the shortest they are likely to have flown
        // 3. figure out the furthest they are likely to have flown
        // 4. draw a line between the two, along the track line
        //      var ts = data.overall;

        var n = parseInt(data.overall.now);
        var fs = parseInt(data.overall.firststart);
        var ls = parseInt(data.overall.laststart);

        //              console.log( "n:"+n+",fs:"+fs+",ls:"+ls );

        // if we haven't had a first start then set now to the same thing - this will
        // prevent anything being drawn
        if( fs == 0 ) {
            if( document.getElementById("firststart") ) {
                document.getElementById("firststart").innerHTML = "no starts yet";
                document.getElementById("laststart").innerHTML = "no starts yet";
            }
            fs = n;
            ls = n;
        } else if( document.getElementById("firststart") ) {
            document.getElementById("firststart").innerHTML = data.overall.firststarttext;
            document.getElementById("laststart").innerHTML = data.overall.laststarttext;
        }


        for( var t = 0; t < starts.length; t++ ) {
            var stime = starts[t].starttime;
            var count = parseInt(starts[t].count);
            plotSpeedLine( map, n - stime, '#FF0000', count, progressbounds );
        }


        // set the last updated time...
        var currentTime = new Date();
        mins = currentTime.getMinutes();

        if( mins < 10 ) {
            mins = "0"+mins;
        }
        document.getElementById("status").innerHTML = "Updated @ " + currentTime.getHours() + ":" + mins;
    }

    // if we are live then focus on where people are
    if( data.starts ) {
        //              zoomystuff( map, progressbounds );
    }
    else {
        // otherwise we want to include all the landouts and the task
        llbounds.extend( taskbounds.getSouthWest() );
        llbounds.extend( taskbounds.getNorthEast() );
        //              zoomystuff( map, llbounds );
    }

    // if it was today then we will refresh ourselves
    if( map.og_today ) {
        // If we are supposed to repeat then set the trigger and start the clock
        setTimeout( function() { refreshDisplay( map ); }, 1 *60000 ); // every minute
    }

}

//
// Draw Spot & Delorme trackers on the screen
//
function loadAllTrackers( map, trackers )
{
    if( ! map.og_task ) {
        console.log( "not updating trackers, no task yet" );
        return;
    }

    // stop displaying a tooltip on a refresh
    if( map.og_currenttooltip ) {
        hideTooltip(map,map.og_currenttooltip);
    }

    // If we already have a trackers function we need to merge the data without replace
    var firstTime = false;
    if( isEmpty( map.og_trackers ) ) {
        console.log( 'firstTime' );
        for( var key in trackers ) {
            var newTracker = trackers[key];

            if( ! existingTracker ) {
                newTracker.maxdistancedone = 0;
		newTracker.taskduration = map.og_task.durationSecs;
		newTracker.min = 999999999999;
		newTracker.max = 0;
		if( newTracker.datafromscoring == 'N' ) {
		    newTracker.utcstart = undefined;
		    newTracker.start = '00:00:00';
		    newTracker.utcfinish = undefined;
		}
	    }
	}
        map.og_trackers = trackers;
        firstTime = true;
    }
    else {
        for( var key in trackers ) {
            var existingTracker = map.og_trackers[key];
            var newTracker = trackers[key];

            if( ! existingTracker ) {
                newTracker.maxdistancedone = 0;
		newTracker.taskduration = map.og_task.durationSecs;
                map.og_trackers[key] = newTracker;
		newTracker.min = 999999999999;
		newTracker.max = 0;
                console.log( "replacing: "+key );

		if( newTracker.datafromscoring == 'N' ) {
		    newTracker.utcstart = undefined;
		    newTracker.start = '00:00:00';
 		    newTracker.utcfinish = undefined;
		}
            }
            else {

		// Until we have scoring we will keep our internal calculations
                var copyKeys = [ 'dayrankordinal', 'lasttp', 'totalrank', 'prevtotalrank', 'lolat' ,'lolong', 'loreported', 'lonear',
                                 'statustext', 'utctime', 'datafromscoring', 'lolat', 'lolng', 'looriginal',
                                 'forcetp' ];

                for ( var copy in copyKeys ) {
                    existingTracker[copyKeys[copy]] = newTracker[copyKeys[copy]];
                }

		// If it has been scored then copy the rest of the data over
		if( newTracker.datafromscoring == 'Y' || newTracker.finish == 'Y' ) {
                    var copyKeys = [ 'start', 'utcstart', 'finish', 'utcfinish', 'dbstatus', 'statustext', 'utctime', 'datafromscoring',
                                     'hspeed', 'speed', 'hdistance', 'distance', 'forcetp' ];

                    copyKeys.forEach( function(value) {
			existingTracker[value] = newTracker[value];
                    } );
		}
            }
        }
    }

//    if( firstTime && ! map.og_today ) {
//	$('#updated').hide();
  //  }

}

function drawAllTrackers( map, trackers ) {
    if( ! map.og_task ) {
        console.log( "not updating trackers, no task yet" );
        return;
    }
    
    // Calculate the tracker
    for( var tracker in trackers ) {
	drawTracker( map, map.og_trackers[tracker] );
    }

    // Now we need to calculate the altitude range for displaying on the heights box
    var min = 99999999;
    var max = 0;
    for( var tracker in trackers ) {
	min = Math.min(map.og_trackers[tracker].min,min);
	max = Math.max(map.og_trackers[tracker].max,max);
    }
    console.log( "height range lowest " + min + ", highest " + max );
    map.results.setHeightRange(min,max);
	

    // Update the results display
    if( map.og_firstTime && map.results ) {
	for( var tracker in trackers ) {
	    map.results.updateDetails(tracker);
	}
        map.results.setSortKey( 'auto' );
        map.results.updateList( false );
    }

}

function isEmpty(obj) {

    // null and undefined are "empty"
    if (obj == null) return true;

    // Assume if it has a length property with a non-zero value
    // that that property is correct.
    if (obj.length > 0)    return false;
    if (obj.length === 0)  return true;

    // Otherwise, does it have any properties of its own?
    // Note that this doesn't handle
    // toString and valueOf enumeration bugs in IE < 9
    for (var key in obj) {
        if (hasOwnProperty.call(obj, key)) return false;
    }

    return true;
}


function processChunk(map,data) {
    

    // Loop through each record in the chunk
    for( var i = 0; i < data.points.length; i++ ) {

	var json = data.points[i];

	// Find the tracker this data pertains to
	var tracker = map.og_trackers[ json.c ];
	
	if( tracker ) {
	    tracker.points.push( json );
            tracker.lasttime = json.t;
	}
    }
};


// Handle incoming events
function incomingData(map,data) {
    if( ! data ) {
        console.log( "missing data" );
        return;
    }
    data = data.replace( /'/g, '"' );
    var json = jQuery.parseJSON( data );

    // any packet will do as a keepalive
    map.og_keepalive_received = 1;

    {
	if( json.listeners ) {
	    map.og_viewercount = json.listeners;
	}
	
        // set the last updated time...
        map.og_currentTime = new Date(0); map.og_currentTime.setUTCSeconds( json.at );
        mins = map.og_currentTime.getMinutes();
        if( mins < 10 ) {
            mins = "0"+mins;
        }
        document.getElementById("updated").innerHTML = "Updated @ " + map.og_currentTime.getHours() + ":" + mins + ", " + map.og_viewercount + " <i class='icon-group'></i>";

        // If we are replaying then we need to set the time properly
        if( map.og_replay ) {
            map.og_rain.setTime( map.og_currentTime );
        }
    }

    // Find the tracker this data pertains to
    var tracker = map.og_trackers[ json.g ];
    if( tracker ) {
        // Add to the front of the array
        if( ! tracker.fastpoints) {
            tracker.fastpoints = [ json ];
            drawTracker( map, tracker );
        }
        else {
            // only add in order
            if( ! tracker.fastpoints.length || tracker.fastpoints[0].at < json.at ) {
                tracker.fastpoints.unshift( json );
                drawTracker( map, tracker );
            }
            else {
            }
        }
        tracker.lasttime = json.g.t;
    }
    else {
	// probably a keep alive so ignore it
	// or a point for a tracker we don't know which we also don't care about
    }
};


//
// Draw a specific tracker
function drawTracker( map, tracker ) {

    // What task is it..
    var task = map.og_task.points;

    // Points to plot
    var slowpoints = tracker.points; // from db
    var fastpoints = tracker.fastpoints ? tracker.fastpoints : []; // from streaming
    var compno = tracker.compno;

    // Make sure we have something to draw!
    if( (slowpoints.length + fastpoints.length) < 2 ) {
        return;
    }

    //
    var totaltime = 0;
    var lastbeforestart = 0;
    var utcstart = tracker.utcstart;

    // contains the combined list of points
    var ll = [];     // LatLong class point used for all calculations
    var llV = [];    // LatLongVector
    var points = []; // original data copied over

    // Capture last DB point, if we don't have one that is fine
    var newestslowpoint = slowpoints.length ? slowpoints[0].at : 0;
    var newestfastpoint = fastpoints.length ? fastpoints[0].at : 0;
    tracker.gainXsecond = 0;
    tracker.lossXsecond = 0;
    tracker.Xperiod = undefined;

    // Points are most recent to oldest, so we need to put any dynamic points
    // in - up to the time we have a full trace

    // From the live feed
    for( var p = 0; p < fastpoints.length && newestslowpoint <= fastpoints[p].at; p++ ) {
        if( ! fastpoints[p].ll ) {
            fastpoints[p].ll = new LatLong( fastpoints[p].lat, fastpoints[p].lng );
        }
        ll.push( fastpoints[p].ll );
        points.push( fastpoints[p] );

        lasttime = fastpoints[p].at;
	tracker.min = Math.min(tracker.min,fastpoints[p].alt*(map.og_units?3.28084:1));
	tracker.max = Math.max(tracker.max,fastpoints[p].alt*(map.og_units?3.28084:1));

        // Calculate the change over approximately 60 seconds
        if( p > 0 && newestfastpoint - lasttime <= 60 ) {
            var diff = (fastpoints[p-1].alt - fastpoints[p].alt)*(map.og_units?3.28084:1);
            if( diff > 0 ) {
                tracker.gainXsecond += diff;
            }
            else {
                tracker.lossXsecond += diff;
            }
            tracker.Xperiod = newestfastpoint - lasttime;
        }
    }

    // So it doesn't display if we didn't record it
    var climbing = false;
    if( tracker.Xperiod ) {
        tracker.gainXsecond = Math.round(tracker.gainXsecond*10)/10;
        tracker.lossXsecond = Math.round(tracker.lossXsecond*10)/10;
	// 9.87 = feet/minute to knots
	// 60 = m/minute to m/sec
        tracker.averager = Math.round(((tracker.gainXsecond + tracker.lossXsecond) / tracker.Xperiod) * 60 / (map.og_units?9.87:6))/10;

        // If we have gained more than twice what we lost then we are climbing
        // and 80fpm
        if( tracker.gainXsecond > 2*(-tracker.lossXsecond) && (tracker.gainXsecond/tracker.Xperiod)*60 > 80 ) {
            climbing = true;
        }
    }
    else {
        tracker.gainXsecond = undefined;
        tracker.lossXsecond = undefined;
        tracker.averager = undefined;
    }

    // remove anything left as we have corresponding slow points from this time back
    fastpoints.length = p;

    // Process the ones from the database
    for( var p = 0; p < slowpoints.length; p++ ) {
        //      console.log( slowpoints[p].at );
        if( ! slowpoints[p].ll ) {
            slowpoints[p].ll = new LatLong( slowpoints[p].l, slowpoints[p].g );
	    slowpoints[p].at = slowpoints[p].t;
	    slowpoints[p].alt = slowpoints[p].a;
	    slowpoints[p].agl = slowpoints[p].h;
        }
        ll.push( slowpoints[p].ll );
        points.push( slowpoints[p] );
	tracker.min = Math.min(tracker.min,slowpoints[p].alt*(map.og_units?3.28084:1));
	tracker.max = Math.max(tracker.max,slowpoints[p].alt*(map.og_units?3.28084:1));

        lasttime = slowpoints[p].at;
    }

    var now = (new Date).getTime()/1000;
    tracker.mostrecent = '';
    if( points.length > 0 ) {
        var now;
        if ( map.og_currentTime ) {
            now = map.og_currentTime.getTime()/1000;
	}
	else  {
	    now = (new Date).getTime()/1000;
	}

        var diff = now - points[0].at;

	var signal = '<span class="icon-stack">'+
	    '<i class="icon-signal"></i>'+
	    '<i class="icon-ban-circle icon-stack-base"></i></span';

        if( diff < 90 ) {
            tracker.mostrecent = 'just now';

	    // determine how to display the signal strength
	    if( points[0].s > 30 ) { signal = "signalgood" }
	    else if ( points[0].s > 20 ) { signal = "signalok" }
	    else { signal = "signalpoor" };
	    signal =  "<a href='#' title='"+points[0].s+" db'> <i class='icon-signal " + signal + "'></i></a>";
        }
        else if ( diff > 7200 ) {
            tracker.mostrecent = Math.round(diff/3600) + " hours ago";
        }
        else
        {
            tracker.mostrecent = Math.round(diff/60) + " minutes ago";
        }
	tracker.mostrecent += " " + signal;

        // And if it is up to date or not
        if( diff <= 90 ) {
            tracker.uptodate = 1;
            tracker.notuptodate = 0;
        }
        else {
            tracker.uptodate = 0;
            tracker.notuptodate = 1;
        }
        tracker.altitude = Math.round(points[0].alt *(map.og_units?.328084:.1))*10;
        tracker.agl = Math.round(points[0].agl *(map.og_units?.328084:.1))*10;
	console.log( tracker.compno + "* " + tracker.altitude + "ft, "+tracker.agl + "ft" );
        tracker.lastPosition = new google.maps.LatLng( points[0].ll.dlat(), points[0].ll.dlong() );
    }

    // Check when the glider started we don't want to carry over traces before this
    if( ! tracker.utcstart || ! tracker.lasttp || tracker.lasttp <= 1 ) {
	findStart( map, tracker, task, ll, points );

	// If the start time has changed then we need to figure out what the last preceeding point is
	for( var p = points.length-2; p > 0; p-- ) {
	    if( points[p].at > tracker.utcstart ) {
		lastbeforestart = p+2;
		break;
	    }
	}

//	console.log( tracker.compno + " -> start @ " + tracker.utcstart ? timeToText(tracker.utcstart) : "none" );
    }
    
    // Create the compno marker, or get previously created one
    var m = createCompnoMarker( map, compno, new google.maps.LatLng(ll[0].dlat(), ll[0].dlong()) );

    // truncate anything before the start time as we don't care about it
    if( lastbeforestart && tracker.utcstart && points.length > lastbeforestart+1 ) {
	console.log( tracker.compno + " truncating trace to " + timeToText(points[lastbeforestart].at) );

	// If we already have a path and it includes points before the start we want to get rid of them
	if( m.firstpointadded && m.firstpointadded > points[lastbeforestart].at ) {
	    m.lastpointadded = 0;
	    m.firstpointadded = points[lastbeforestart].at;
	    resetPath( m );
	}
	
        points.length = lastbeforestart;
	lastbeforestart = undefined;
    }


    // less than 3 kph and less than 0.5m/s height change means stationary
    var stationary = points.length > 1 ?
        ((Math.abs(Math.round(LatLong.distHaversine( ll[0], ll[1] )/(points[0].at - points[1].at)*3600)) < 3) &&
         (Math.round(2*(points[0].alt - points[1].alt)/(points[0].at - points[1].at)) == 0))
        : 0 == 1 ;

    // If we are more than 40 minutes since the last trace then assume it's done
    if( (map.og_currentTime ? map.og_currentTime.getTime()/1000 : tracker.utctime) - points[0].at > 40*60 ) {
        console.log( tracker.compno + "* stationary due to no points " + timeToText(points[0].at));
	stationary = 1;
    }    

    if( stationary ) {
        console.log( tracker.compno + "* stationary at " + timeToText(points[0].at));
    }

    // Calculate the point to point & accumulated distance
    var newestpoint = points[0].at;
    for( var p = points.length -1; p >= 0; p-- ) {

        // If we haven't plotted the point yet then we need to
        if( points[p].at > m.lastpointadded ) {

            // If it was 2 minutes ago then split the path, need to end and
            // start a new one
            if( points[p].at - m.lastpointadded > 120 ) {
                splitPath( map, m );
            }

            m.points.push( new google.maps.LatLng( ll[p].dlat(), ll[p].dlong() ));
            m.lastpointadded = points[p].at;
	    m.firstpointadded = Math.min(points[p].at,m.firstpointadded);
        }

    }
    
    if( tracker.utcstart ) {
	tracker.start = timeToText( tracker.utcstart );
	tracker.dbstatus = 'S';
    }
    else {
	
	// Update the tooltip
	updateCompnoMarker( map, compno, tracker.notuptodate, climbing );
	
	// Update the results display
	if( map.results ) {
	    map.results.updateDetails( compno );
	}
	
	console.log( tracker.compno + ": no start" );
	
	if( stationary && tracker.status && tracker.status.search('tationary') != -1 ) {
	    tracker.status = tracker.status + "Stationary. ";
        }
	
	return;
    }

    if( ! tracker.utcfinish ) {
	// Make sure we don't do this more than once every 30 seconds
	if( ! tracker.lastScored || tracker.lastScored + 60 < points[0].at || map.results.isChosenPilot( tracker.compno )) {
	    // remove old points we will do it all again for now - this is only displayed on a hover anyway so no
	    // real worry about occasional flicker
	    tracker.status = "";
	    m.scoredpoints.clear();

	    console.log( tracker.compno + " scoring at " + timeToText(points[0].at));

	    //
	    tracker.lastScored = points[0].at;

	    // Only do this if we have a start
	    if( tracker.utcstart ) {
		if( map.og_task.type === "A" ) {
		    scoreAATPoints( task, tracker, points, ll, m );
		}
		else {
		    scoreSpeedTask( map.og_task, tracker, points, ll, m );
		}
	    }
	}
    }

    // Update the status of the glider properly
    if( tracker.utcfinish ) { // Finishes are definitive
	tracker.dbstatus = 'F';
    }
    else {

	// If we are now stationary
	if( stationary ) {
	    if( ! tracker.utcstart ) {
		tracker.dbstatus='G';
	    }
	    else {
		console.log( tracker.compno + " assuming landout" );

		if( LatLong.distHaversine( ll[0], task[task.length-1].ll ) < 0.5 ) {
		    tracker.dbstatus = 'H';
		}
		else {
		    tracker.dbstatus = 'R';
		}
		
		tracker.speed = undefined;
		tracker.hspeed = undefined;
		tracker.grremaining = undefined;
		tracker.hgrremaining = undefined;
	    }
	}
	else {
	    if( tracker.utcstart ) {
		tracker.dbstatus = 'S';
	    }
	    else {
		tracker.dbstatus='G';
	    }
	}
    }
    tracker.stationary = stationary;

    if( tracker.utcstart && ! tracker.utcfinish ) {
	tracker.utcduration = points[0].at - tracker.utcstart;
	tracker.duration = durationToText( tracker.utcduration );
    }

    // Update the tooltip
    updateCompnoMarker( map, compno, tracker.notuptodate, climbing );
    
    // Update the results display
    if( map.results ) {
        map.results.updateDetails( compno );
    }
}

function scoreSpeedTask( taskObject, tracker, points, ll, m ) {

    // If we have a handicap distance task then we need to
    // adjust it for our handicap
    // apart from that we treat it exactly the same as a normal speed task
    var handicap = tracker.handicap;
    var task = taskObject.points;
    if( taskObject.type == 'D' ) {
        task = adjustTask( taskObject, tracker.handicap, taskObject.points );
    }

    var prevdist;
    var distancedone = 0; // aat only
    var hdistancedone = 0; // aat only

    // Always start at start for scored line
    m.scoredpoints.push( new google.maps.LatLng( task[0].ll.dlat(), task[0].ll.dlong() ));

    var t = 1;
    var p = points.length-2;
    var lastaatscoredpoint = ll[p+1];
    prevdist = Math.round(LatLong.distHaversine( ll[p+1], task[t].ll )*10)/10;
    var prevdistances = [];
    var prevpoint = [];
    var prevtime = [];
    var sectorpoints = 0;
    var maxpoint = 0; // AAT: last point used for scoring
    var insector = 0;

    var maxdistancedone = 0;
    var hdistancedone = 0;
    var hremainingdistance = 0;
    var remainingdistance = 0;
    
    var finishLeg = task.length-1; 

    if( tracker.forcetp != '' ) {
        console.log( tracker.compno + "* forcetp: " + tracker.forcetp );
        tracker.forcetp = parseInt(tracker.forcetp);

        while( t < tracker.forcetp ) {
            distancedone += task[t].length; //aat only
            hdistancedone += (100.0*task[t].length)/Math.max(tracker.handicap+task[t].hi,25); // Accumulate the handicapped distance
            m.scoredpoints.push( new google.maps.LatLng( task[t].ll. dlat(), task[t].ll.dlong() ));
            t++;
        }
    }

    //    console.log( "------------------------------------------------------------" );
    while( p >= 0 && t < task.length ) {

        // Skip over points that are too close in distance, this should ignore thermalling
        // we really want about a 2.5 k jump
        var forward = p+1;
	var accumulated = 0;
	
        do {
            var skipmore = 0;

	    if( task[t].type == 'sector' ) {

                // check if we are in the sector - skip on tps that don't have sectors...
                if( checkIsInTP(task[t],ll[p] ) >= 0 ) {
		    sectorpoints++;
		    insector = 1;
		    console.log( tracker.compno + "* in sector " + t + " at " + timeToText(points[p].at));
		}
		else {
		    insector=0;
		}
            }

	    // Cache and accumulate distance till we find 2km
	    accumulated += ll[p].pdist ? ll[p].pdist : (ll[p].pdist = LatLong.distHaversine( ll[p], ll[p+1] ));

            if( accumulated < 2 ) {
                p--;
                skipmore = 1;
            }

        } while ( p >= 0 && skipmore && ! insector );

        // We wanted to do the insector on the last point but we don't want to advance past it
        if( p < 0 ) {
            p = 0;
        }

        // If we are longer than the leg we are on then we are not on the leg or something odd, assume we
        // are at the beginning of it - this should stop negative numbers.  Note we adjust by r1 only if we are
        // not an AAT.  AATs deal with this differently!  This adjustment is mostly needed for the distance handicapped
        // task
        var curdist = LatLong.distHaversine( ll[p], task[t].ll);
        var advancetp = 0;
	
        // Store these and only keep previous 3
        prevdistances.push( curdist );
        prevpoint.push( ll[p] );
        prevtime.push( points[p].at );

        if( prevdistances.length > 3 ) {
            prevdistances.shift();
            prevpoint.shift();
            prevtime.shift();
        }

//	console.log( tracker.compno + " ---> " + insector + ", " + sectorpoints + ", t " + t );
	
	// Check for the finish, if it is then only one point counts and we can stop tracking
	if( t == finishLeg && sectorpoints > 0 )  {
	    console.log( tracker.compno + "* found a finish " + points[p].at );
	    tracker.utcfinish = points[p].at;
	    finish = points[p].at;
	    tracker.finish = timeToText( tracker.utcfinish );
	    t++;
	}

        // If we don't have 3 previous distances then skip this point
        else if( prevdistances.length == 3 ) {

            // If we aren't in the sector but we have some points in what we consider to be the sector then we will advance it
            if( ! insector && sectorpoints > 0 ) {
                console.log( tracker.compno + "* next tp:" + t + "/"+insector + ",sp:"+sectorpoints );
                advancetp = 1;
            }

	    
            // Allow for a dog leg - ie closer and then further
            // most recent two point may be the departure rather than
            // the entry so we need to look back an extra one
	    var timeTaken = (prevtime[2] - prevtime[0]);
	    var achievedSpeed = ((prevdistances[0] + prevdistances[2]) / timeTaken );
	    var possibleSpeed = (timeTaken > 600 ? 120 : 240)/3600;
            if ( t !== finishLeg && curdist > prevdistances[1] && 
                 achievedSpeed < possibleSpeed ) {
		console.log( tracker.compno + "* dog leg "+t+", "+ (prevdistances[0]+prevdistances[2]) + "km in " + timeTaken +
			     "seconds, but could have achieved distance in the time: "+ achievedSpeed +" < "+ possibleSpeed );
                advancetp = 1;
            }

            // Next task turn point and distance to it
            if( advancetp ) {

		if( t != task.length-1 ) {
                    m.scoredpoints.push( new google.maps.LatLng( task[t].ll. dlat(), task[t].ll.dlong() ));
		}
                t++;
                insector = 0;
		sectorpoints = 0;
            }

        }

        prevdist = curdist;
        p--;
    }

    // include from last tp to here (aat only)
    // don't include anything longer than the first leg on the first leg
/*    if( tracker.start != '00:00:00' ) {
        var remainingdistance;
        if( t == 1 && LatLong.distHaversine( task[1].ll, ll[0] ) < task[1].length ) {
            remainingdistance  = Math.round(LatLong.distHaversine( task[0].ll, ll[0] )*10)/10;
        }
        else if ( t > 1 ) {
            remainingdistance  = Math.round(LatLong.distHaversine( lastaatscoredpoint, ll[0] )*10)/10;
        }
    } */

    console.log( tracker.compno + "* leg t" + t + " length " + task.length);

    ///////////////////////////////////////////
    // Output the information about how the task is going here
    ///////////////////////////////////////////

    if( t == task.length ) {
	console.log( tracker.compno + "* finish leg" );
        tracker.status = "finished";

        // Store away our finish
        if( ! tracker.capturedfinishtime && tracker.datafromscoring == 'N' ) {
	    tracker.dbstatus = 'F';
	    tracker.utcfinish = tracker.capturedfinishtime = points[p>0?p:0].at;
            tracker.finish = timeToText( tracker.utcfinish );
	    tracker.utcduration = tracker.utcfinish - tracker.utcstart;
	    tracker.duration = durationToText( tracker.utcduration );
            console.log( tracker.compno + "* captured finish time: "+timeToText(tracker.utcfinish));
        }

	// not relevant on a finished task
        tracker.remaining = undefined;
        tracker.hremaining = undefined;
        tracker.grremaining = undefined;
        tracker.hgrremaining = undefined;

        var lasttp = t-1;
	console.log( "XX leg " + (lasttp-1) + "," + task[lasttp].length );
	var scoredTo = LatLong.intermediatePoint(task[lasttp-1].ll,task[lasttp].ll,
						 (task[lasttp].lengthA)/6371,(task[lasttp].length/task[lasttp].lengthA));
	m.scoredpoints.push( new google.maps.LatLng( scoredTo.dlat(), scoredTo.dlong() ));
	
	// pass onwards as the reference numbers rather than any calculations
        maxdistancedone = taskObject.distance;
        hdistancedone = tracker.htaskdistance;
    }
    else {
	    
	// We haven't finished but want to calculate everything properly

        // Distance from current point to next turnpoint...
	// Make sure we aren't further than the next leg is long
        var nextdist = Math.round(Math.min(LatLong.distVincenty( ll[0], task[t].ll),task[t].length)*10)/10;


        // We will only report next turn point if it isn't the last turn point,
        // also doesn't mean much when we are inside the sector so slightly different display for that
        var nexttp = '';
        tracker.lasttp = t;

        if ( t+1 < task.length ) {
            tracker.status = nextdist + " km to tp #"+t+", "+task[t].trigraph+" ("+task[t].name+")";
        }
        else {
	    tracker.status = nextdist + " km to finish";
        }

        // add rest of task to outstanding distance
        var lasttp = t;
        remainingdistance = nextdist;
        hremainingdistance = t < task.length ? (100.0*nextdist)/Math.max(handicap+task[t].hi,25) : 0; // Accumulate the handicapped distance

        for(t++; t < task.length;t++ ) {
            remainingdistance += task[t].length;
            hremainingdistance += (100.0*task[t].length)/Math.max(handicap+task[t].hi,25); // Accumulate the handicapped distance
        }

        // These are the only differences for the display between the two
        // last point and task distance calculations
        maxdistancedone = Math.max( taskObject.distance - remainingdistance, 0);
        hdistancedone = Math.max( tracker.htaskdistance - hremainingdistance, 0);

	// And draw to where it has been scored
	var scoredTo = LatLong.intermediatePoint(task[lasttp-1].ll,task[lasttp].ll,
						 task[lasttp].length/6371,1-(nextdist/task[lasttp].lengthA));
	    
        m.scoredpoints.push(new google.maps.LatLng( scoredTo.dlat(), scoredTo.dlong() ));
    }
    
    console.log( tracker.compno + "* " + tracker.start + ", finish "+ tracker.finish);

    // establish distance flown and speed
    if( tracker.utcstart && tracker.datafromscoring != 'Y') {

        var elapsed = ((tracker.utcfinish ? tracker.utcfinish : points[0].at) - tracker.utcstart)/3600;
        if( elapsed < 0 ) {
            elapsed = 1000000000000000;
        }
        console.log( tracker.compno + "* elapsed:"+elapsed+", utcs:"+tracker.utcstart+", utcf:"+tracker.capturedfinishtime );
        console.log( tracker.compno + "* hdd:"+hdistancedone+", mhdd:"+maxdistancedone );

        tracker.hdistancedone = hdistancedone;
        tracker.distancedone = maxdistancedone;
	tracker.lasttp = lasttp;

        var speed = Math.round( (maxdistancedone * 10) / elapsed )/10; // kph
        var hspeed = Math.round( (hdistancedone * 10) / elapsed )/10; // kph
        if( maxdistancedone > 0 ) {
            tracker.speed = speed;
            tracker.hspeed = hspeed;
        }

	// make sure we aren't too fast and that we have been past start for a few minutes (x/60)
	if( tracker.speed > 180 || tracker.hspeed > 180 || elapsed < (5/60) ) {
	    tracker.speed = undefined;
	    tracker.hspeed = undefined;
	}

        tracker.remaining = Math.round(remainingdistance*10)/10;
        tracker.hremaining = Math.round(hremainingdistance*10)/10;

 	if( ! tracker.stationary ) {
            tracker.grremaining = Math.round((remainingdistance*1000)/(points[0].agl));
            tracker.hgrremaining = Math.round((hremainingdistance*1000)/(points[0].agl));
	}

        // Remove if we don't want them, will stop the display
        // Distance handicaps don't have a concept of handicapped or not as the task is adjusted
        // by the pilots
        if( task.type == 'D' ) {
            tracker.hspeed = tracker.speed;
            tracker.hremaining = tracker.remaining;
            tracker.hdistancedone = tracker.distancedone;
	    tracker.hgrremaining = tracker.grremaining;
        }

        console.log( tracker.compno + "* speed:"+speed+", hspped:"+hspeed);
    }
}

//
// Draw the speed line on the map
//
function plotSpeedLine( map, flyingtime, colour, count, progressbounds )
{
    // no flying - no line
    if( flyingtime <= 0 ) {
        return;
    }

    // calculate how far they could have flown for
    var slowestd = flyingtime/3600 * map.og_minspeed;
    var fastestd = flyingtime/3600 * map.og_maxspeed;

    var fpoints = [];
    var wdtotal = 0;

    var task = map.og_task.points;

    /* put the task on the map */
    for( i = 1; i < task.length; i++ )
    {
        var llength = task[i].wlength; // how long this leg is

        // start point of the leg
        var ltlg = new LatLong( task[i-1].nlat, task[i-1].nlng );
        var ltlg2 = new LatLong( task[i].nlat, task[i].nlng );

        var bearing = LatLong.bearing( ltlg, ltlg2 );

        // if we are between the two we need to add the turn point
        if( slowestd <= 0 && fastestd > 0 ) {
            fpoints.push( new google.maps.LatLng( task[i-1].nlat, task[i-1].nlng ) );
        }


        // we don't start drawing until we've hit the minimum length
        if( slowestd > 0 && slowestd < llength ) {

            var adj = (task[i].length / llength) * slowestd;

            // get the point along the line (bearing + start lat/long)
            // this is our first point
            var dltlg = ltlg.destPointRad( bearing, adj );

            fpoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));


        }
        // Do the last point

        if( fastestd > 0 && fastestd < llength ) {
            // get the point along the line (bearing + start lat/long)
            // this is our last point

            var adj = (task[i].length / llength) * fastestd;

            var dltlg = ltlg.destPointRad( bearing, adj );

            // we want to add the beginning of this segment as well
            // as how far along we have gone
            fpoints.push( new google.maps.LatLng( ltlg.dlat(), ltlg.dlong() ));
            fpoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
            // stop looping now
            i = task.length;

        }

        // we've done this bit so drop it out
        slowestd -= llength;
        fastestd -= llength;
    }

    // if we only got one point then add the end of the task to make it a line
    if( fpoints.length < 2 || fastestd >= 0 ) {
        fpoints.push( new google.maps.LatLng( task[i-1].nlat, task[i-1].nlng ));
    }


    // update viewport size
    //  for( i = 1; i < fpoints.length; i++ ) {
    //  progressbounds.extend( fpoints[i] );
    //}


    // draw the status line...
    var o = new google.maps.Polyline( { path: fpoints,
                                        strokeColor: colour,
                                        strokeWeight: 18,
                                        strokeOpacity: Math.max((count/map.og_competitors)/2),
                                        zIndex: 1
                                      });

    o.setMap( map );
    map.og_progressoverlays.push( o );

}


function zoomPilot( map, compno ) {
    var nZoom = 11;

    // make sure it exists and we know where it is
    var tracker = map.og_trackers[compno];
    if( tracker && tracker.lastPosition && ! tracker.utcfinish ) {
        if (map.getZoom() == nZoom) {
            map.panTo(tracker.lastPosition);
        } else {
            map.setCenter(tracker.lastPosition);
            map.setZoom(nZoom);
        }
    }
}


function zoomTurnpoint( className, trigraph ) {
    var map = document.getElementById( 'map'+className ).og_mapObject

    var nZoom = 12;

    // if we don't have a task
    if( ! map.og_task || ! map.og_task.points ) {
        return;
    }

    var task = map.og_task.points;
    for( i = 0; i < task.length; i++ ) {
        if( task[i].trigraph == trigraph ) {
            var ltlg = new google.maps.LatLng( task[i].nlat, task[i].nlng );
            if (map.getZoom() == nZoom) {
                map.panTo(ltlg);
            } else {
                map.setCenter(ltlg);
                map.setZoom(nZoom);
            }
        }
    }
}

function zoomTask( className ) {
    var map = document.getElementById( 'map'+className ).og_mapObject
    zoomystuff( map, map.og_taskbounds );
}

function addLandoutMarker( lat, lng ) {
    var map = document.og_map;

    var ll = new google.maps.LatLng( parseFloat(lat), parseFloat(lng) );
    //  map.setCenter( ll, 12);
    document.og_map.panTo( ll );
    document.og_map.setZoom( 15 );

    marker = createPilotMarker( map, ll );
    return marker;
}


// TBD: Check for line crossing here
function checkIsInTP( turnpoint, ll ) {
 
    // Quick check to see if it is plausible
    var x = LatLong.distHaversine(ll,turnpoint.ll);
    if( x < turnpoint.maxR ) {

	// If we are inside the radius and the sector is just a circle then we are done
	if( turnpoint.quickSector ) {
	    return +x;
	}

	// Otherwise confirm on polygon
	return google.maps.geometry.poly.containsLocation(new google.maps.LatLng( ll.dlat(), ll.dlong()), turnpoint.polygon ) ? +x : -x;
    }
    return -x;
}


//
// add the task to the map
//
function drawTaskMap( mapObject ) {

    mapObject.og_taskbounds = new google.maps.LatLngBounds;

    var o;
    while( o = mapObject.og_taskoverlays.pop() ) {
        o.setMap(null);
    }

    // find out what the task is and go through and draw it
    var task = mapObject.og_task.points;
    var taskpoints = [];

    for( i = 0; i < task.length; i++ ) {
        task[i].ll = new LatLong( task[i].nlat, task[i].nlng );

	// Help speed up turnpoint checking
	if( task[i].type == 'sector' && task[i].a1 == 180 && ! task[i].a12 && !task[i].r2 ) {
	    task[i].quickSector = 1;
	}
	task[i].maxR = Math.max(task[i].r1,task[i].r2);
    }

    // This is one place where the leg length does matter
    for( i = 1; i < task.length; i++ ) {
	console.log( "leg "+i+" db length:"+task[i].length+", length haversine: " + LatLong.distHaversine(task[i-1].ll,task[i].ll ) +", length vincenty: " + LatLong.distVincenty(task[i-1].ll,task[i].ll ));
	task[i].length = task[i].lengthA = LatLong.distVincenty(task[i-1].ll, task[i].ll );

    }

    // If it is the last point then we need to reduce it by the radius of the finish ring
    if( task[i-1].type == 'sector' && task[i-1].a1 ==180 ) {
	console.log( "reducing last leg by radius of finish ring" +task[i-1].r1);
	task[i-1].length -= task[i-1].r1;
    }

    mapObject.og_task.distance = 0;
   
    // add all the pretty markers showing what the turnpoints are
    for( i = 0; i < task.length; i++ ) {

	// Sum the actual lengths rather than using the database ones
	mapObject.og_task.distance += task[i].length;
	
        // start point of the leg
        var ltlg = new google.maps.LatLng( task[i].nlat, task[i].nlng );
        var marker;

        // if it's the start point
        if( i == 0 ) {

            if( task[task.length-1].trigraph == task[i].trigraph ||
                (task[task.length-1].nlat == task[i].nlat && task[task.length-1].nlng == task[i].nlng )) {
                // check to see if joint s&f
                marker = createTPMarker( mapObject, ltlg, "SF", "Start &amp; Finish: " + task[i].trigraph + ": " + task[i].name  );
            }
            else {
                // or just a start
                marker = createTPMarker( mapObject, ltlg, "S", "Start: " + task[i].trigraph + ": " + task[i].name );
            }
        }
        else if( i == (task.length-1) ){

            // do nothing unless it's not a joint s&f
            if( task[0].trigraph != task[i].trigraph &&
                (task[0].nlat != task[i].nlat || task[0].nlng != task[i].nlng )) {
                marker = createTPMarker( mapObject, ltlg, "F", "Finish: " + task[i].trigraph + ": " + task[i].name );
            }

        } else {

            // need to make sure we are not the same as another one
            var second = 0;
            for( var j = 0; j < task.length && second == 0; j++ ) {

                if( task[j].trigraph == task[i].trigraph ) {

                    if( j > i ) {
                        second = j;
                    } else if( j < i ) {
                        // dont plot the first one
                        second = -1;
                    }
                    else {
                        // if it is i then noop
                    }
                }
            }

            // either add a joined marker or a single, if we have already got one
            // (second = -1 above) then do nothing
            if( second > 0 ) {
                marker = createTPMarker( mapObject, ltlg, i+"_"+second, "Turnpoint "+i+"&amp;"+second+": " + task[i].trigraph + ": " + task[i].name);
            } else if ( second == 0 ) {
                marker = createTPMarker( mapObject, ltlg, i, "Turnpoint "+i+": " + task[i].trigraph  + ": " + task[i].name);
            }
        }

        // add to the poly line and expand the viewport to encompass the whole task
        taskpoints.push( ltlg );

        drawTurnpoint( mapObject, task, i );

        if( mapObject.og_taskbounds ) {
            mapObject.og_taskbounds.extend( ltlg );
        }
    }

    mapObject.og_taskoverlays.push( o = new google.maps.Polyline( {path:taskpoints } ));
    o.setMap( mapObject );
}


function drawTurnpoint( map, task, tpno ) {

    var polypoints = [];
    var turnpoint = task[tpno];

    var symmetric = 0;
    var np = 9999;
    var pp = 9999;

    var ltlg = turnpoint.ll;

    var a1 = -1, a2 = -1;
    if( tpno < task.length-1 ) {
        var ltlgn = task[tpno+1].ll;
        np = a1 = LatLong.radToDBrng(LatLong.bearing( ltlg, ltlgn ));
    }

    if( tpno >= 1 ) {
        var ltlgp = task[tpno-1].ll;
        pp = a2 = LatLong.radToDBrng(LatLong.bearing( ltlg, ltlgp ));
        console.log( "2b) pp=" + pp );

    }


    if( np == 9999 ) {
        np = pp;
    }

    if( pp == 9999 ) {
        pp = np;
    }

    var center = 0;
    switch( turnpoint.direction ) {
    case "symmetrical":
        if( a1 != -1 && a2 != -1 ) {
            var x1 = a1-a2;
            if( x1 < 0 ) {
                x1 += _2pi;
            }
            var x2 = a2-a1;
            if( x2 < 0 ) {
                x2 += _2pi;
            }
            var minAngle = Math.min(x1,x2);
            if( (a1+minAngle)%_2pi == a2 ) {
                center = (a1+minAngle/2+Math.PI)%_2pi;
            }
            else {
                center = (a2+minAngle/2+Math.PI)%_2pi;
            }
        }
        break;
    case "np":
        center = (np + Math.PI) % (2*Math.PI);
        break;
    case "pp":
        center = (pp + Math.PI) % (2*Math.PI);
        break;
    case "fixed":
        if( typeof turnpoint.a12 !== 'undefined' && ! isNaN(turnpoint.a12) && turnpoint.a12 !== '') {
            center = ((turnpoint.a12*Math.PI/180) + Math.PI) % (2*Math.PI);
//            center = ((turnpoint.a12*Math.PI/180)) % (2*Math.PI);
        } else {
            console.log( 'No A12 specified' );
        }
        break;
    default:
        console.log( turnpoint.direction + " not implemented yet" );
        break;
    }

    // some sanity checking - we should really report this
    if( turnpoint.r2 > turnpoint.r1 ) {
        turnpoint.r2 = turnpoint.r1;
    }

    if( turnpoint.a1 > 180 ) {
        turnpoint.a1 = 180;
    }

    if( turnpoint.a2 > 180 ) {
        turnpoint.a2 = 180;
    }

    turnpoint.centerAngle = (center + 2*Math.PI)%(2*Math.PI);;
    turnpoint.centerAngleRaw = center;

    // Needed for both line and sectors
    var a1rad = turnpoint.a1*Math.PI/180;
    var from = (2*Math.PI+(center - a1rad))%(2*Math.PI);
    var to = (2*Math.PI+(center + a1rad))%(2*Math.PI);

    switch( turnpoint.type )
    {
        case "line":
        console.log( "line: from:" + from + ", to:" + to + ", r1:"+turnpoint.r1  );

        var dltlg = ltlg.destPointRad( from, turnpoint.r1 );
        polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
        dltlg = ltlg.destPointRad( to, turnpoint.r1 );
        polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
        map.og_taskoverlays.push(  o = new google.maps.Polyline( {
            path: polypoints,
            strokeColor: '#000',
            strokeWeight: 3,
            strokeOpacity: 0.4,
        } ));
        o.setMap( map );
        break;

        case "sector":
        console.log( "sector: from:" + from + ", to:" + to + ", r1:"+turnpoint.r1 + ",r2:"+turnpoint.r2 );

        addArc( polypoints,
                from, to,
                ltlg, turnpoint.r1, turnpoint.r2 );

        // something has been configured for turnpoint a2
        //turnpoint a2 has been configured and has a radius
        if( turnpoint.a2 != 0 && ! isNaN( turnpoint.a2 ) && ! isNaN( turnpoint.r2 ) &&
            Math.round(Math.abs(turnpoint.a2)) == Math.round(Math.abs(turnpoint.a1)) && turnpoint.r1 != turnpoint.r2  &&
            turnpoint.r2 != 0 ) {

            console.log( "(neg) a1:"+turnpoint.a1, ", a2:"+turnpoint.a2 );

            addArc( polypoints,
                    center + (turnpoint.a1*Math.PI/180),
                    center - (turnpoint.a1/180*Math.PI),
                    ltlg, turnpoint.r2, 1 );
        }
        else if( turnpoint.a2 != 0 && ! isNaN( turnpoint.a2 ) && ! isNaN( turnpoint.r2 ) &&
                 turnpoint.a1 != turnpoint.a2 &&
                 turnpoint.r1 != turnpoint.r2 ) {

            console.log( "! a1:"+turnpoint.a1, ", a2:"+turnpoint.a2 );

            addArc( polypoints,
                    center + (turnpoint.a1*Math.PI/180),
                    center + (turnpoint.a2/180*Math.PI),
                    ltlg, turnpoint.r2 );

            if( turnpoint.a2 != 180 ) {
                pointAtRadius( polypoints, ltlg, 0, 0 );
            }

            addArc( polypoints,
                    center - (turnpoint.a2/180*Math.PI),
                    center - (turnpoint.a1*Math.PI/180),
                    ltlg, turnpoint.r2 );

        }
        //turnpoint a2 has been configured and has a radius
        else if( turnpoint.a2 == 0 && turnpoint.r1 != turnpoint.r2  &&
                 turnpoint.r2 != 0 ) {

            addArc( polypoints,
                    center + (turnpoint.a1*Math.PI/180),
                    center - (turnpoint.a1/180*Math.PI),
                    ltlg, turnpoint.r2, 0 );
        }
        else if( turnpoint.a1 != 180 ) {
            pointAtRadius( polypoints, ltlg, 0, 0 );
        }

        map.og_taskoverlays.push(  o = new google.maps.Polygon( {
            path: polypoints,
            strokeColor: '#000',
            strokeWeight: 1,
            strokeOpacity: 0.4,
            fillColor: '#aaa',
            fillOpacity: 0.4 } ));
        o.setMap( map );
        // capture the polygon - we will use it for point inside calculations
        task[tpno].polygon = o;
        break;
    }
}


function addArc( polypoints, startAngle, endAngle, ltlg, radius, backwards ) {

    if( Math.round(((2*Math.PI+startAngle)%(Math.PI*2))*20) == Math.round(((2*Math.PI+endAngle)%(Math.PI*2))*20) ) {
        for( var i = 2*Math.PI, adj = Math.PI/40; i >= 0; i -= adj ) {
            var dltlg = ltlg.destPointRad( i % (2*Math.PI), radius);
            polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
        }
        pointAtRadius( polypoints, ltlg, 2*Math.PI, radius );
    }
    else if( 0 ) {
        if( startAngle < endAngle )    {
            for( var i = startAngle, adj = (endAngle-startAngle)/40, ea = Math.round(endAngle*100); Math.round(i*100) <= ea; i -= adj ) {
                var dltlg = ltlg.destPointRad( i, radius );
                polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
            }

        }
        else {
            for( var i = startAngle, adj = ((_2pi+(startAngle - endAngle))%(_2pi))/40, ea = Math.round(endAngle*100); i >= startAngle || Math.round(i*100) <= ea ; i = roundRad(i +adj) ) {
                var dltlg = ltlg.destPointRad( i, radius );
                polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
            }
        }
    }
    else if( startAngle < endAngle )    {
        for( var i = startAngle, adj = (endAngle-startAngle)/40, ea = Math.round(endAngle*100); Math.round(i*100) <= ea; i += adj ) {
            var dltlg = ltlg.destPointRad( i, radius );
            polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
        }

    }
    else {
        for( var i = startAngle, adj = ((_2pi+(startAngle - endAngle))%(_2pi))/40, ea = Math.round(endAngle*100); i >= startAngle || Math.round(i*100) <= ea ; i = roundRad(i +adj) ) {
            var dltlg = ltlg.destPointRad( i, radius );
            polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
        }
    }
}

// Make sure we have a round number
function roundRad( i ) {
    return (_2pi+i)%_2pi;
}

function pointAtRadius( polypoints, ltlg, radians, radius ) {
    var dltlg = radius ? ltlg.destPointRad( radians, radius ) : ltlg;
    polypoints.push( new google.maps.LatLng( dltlg.dlat(), dltlg.dlong() ));
}


// Make a copy of the task reduced for the specified handicap
function adjustTask( taskObject, handicap, task ) {
    //
    if( ! task.adjustments ) {
        task.adjustments = [];
    }
    if( task.adjustments[handicap] ) {
        return task.adjustments[handicap];
    }

    // Make a new array for it
    var newTask = task.adjustments[handicap] = task.slice(0);

    // reduction amount (%ish)
    var maxhtaskLength = taskObject.distance / (taskObject.og_highesthandicap/100);
    var mytaskLength = maxhtaskLength * (handicap/100);
    var mydifference = taskObject.distance - mydifference;
    var spread = 2*(newTask.length-1)+2; // how many points we can spread over
    var amount = mydifference/spread;

    // how far we need to move the radius in to achieve this reduction
    var adjustment = Math.sqrt( 2*(amount*amount) );

    // Now copy over the points reducing all symmetric
    for( i = 1; i < newTask.length-1; i++ ) {

        if( newTask[i].type == 'sector' && newTask[i].direction == 'symmetrical') {
            newTask[i].r2 += adjustment;
        }
        else {
            console.log( "Invalid handicap distance task: "+newTask[i].toString() );
        }
    }

    return newTask;
}


function findStart( map, tracker, task, ll, points )
{
    var t = 0;
    var p = points.length-2;

    // Make sure we don't do this more than once every 60 seconds
    if( tracker.lastCheckforStart && tracker.lastCheckforStart + 60 > points[0].at ) {
	return undefined;
    }
    console.log( tracker.compno + "* " + tracker.lastCheckforStart ? tracker.lastCheckforStart : '-1' + "," + points[0].at );
    tracker.lastCheckforStart = points[0].at;

    
    var insector = 0;
    var wasinsector = 0;
    var compno = tracker.compno;

    //
    var starttime = 0;
    var lastsector = 0;
    var laststarttime = 0;

    // Shortcut to the startline which is expected to always be the first point
    var startLine = task[0];    

    // We have to reverse the center angle as it is calculated for the sectors above and therefore
    // is the bisector
    var centerAngle = (startLine.centerAngle + Math.PI) % (2.0*Math.PI);
    var a1rad = startLine.a1*Math.PI/180;
    

    // find the right end of the line, we will look back along it to confirm the bearings are correct
    var a1a = (2*Math.PI+(centerAngle - a1rad))%(2.0*Math.PI);
    var rightEnd = startLine.ll.destPointRad(a1a,startLine.r1);
    // get reverse bearing point 2 to point 1 & reverse it by adding 180º
    var rightEndBearing = (LatLong.bearing(rightEnd, startLine.ll) + Math.PI) % (2*Math.PI);
    var ang_start = centerAngle-a1rad;

    console.log( LatLong.radToDegMin(centerAngle) + ", " + LatLong.radToDegMin(a1rad) + "=" + LatLong.radToDegMin(a1a) );

    // make sure we have enough points to make it worthwhile
    if( p < 1 ) {
	return 0;
    }

    if( startLine.type !== 'sector' ) {
	console.log( "please write line cross stuff!" );
	return 0;
    }

    console.log( "---[ "+compno+"* start ] ------------------------------------------------------------" );

    do {

        insector = 0;

        // We only do this test once for each point, save it in the original point object
	
        // check if we are in the sector - skip on tps that don't have sectors...
        if( LatLong.distHaversine(ll[p],startLine.ll) <= startLine.r1 &&
	    google.maps.geometry.poly.containsLocation(new google.maps.LatLng( ll[p].dlat(), ll[p].dlong()), startLine.polygon ) ) {
//	    console.log( compno + " in sector at " + timeToText(points[p].at) );
            insector = 1;
            wasinsector = 1;

	    // If we are in the start sector this is now wrong
	    laststarttime = undefined;
	    tracker.startLocation = undefined;
	    tracker.utcstart = undefined;	
        }

	// If we hit tp2 the stop looking (or within 3 km of it)
	if( checkIsInTP(task[1], ll[p]) + 3 >= 0 ) {
	    ll[p].insector = 1;
	    ll[p].sectornumber = 1;
	    console.log( compno + "* in tp sector at " + timeToText(points[p].at) );
	    break;
        }
	
	if( wasinsector && ! insector ) {
	    laststarttime = points[p+1].at;
	    tracker.startLocation = ll[p+1];
	    tracker.utcstart = points[p+1].at;
	    wasinsector = 0;
	}

        p--;

    } while ( p > 0 );

    if( wasinsector ) {
	console.log( compno + "* oops.. still insector at " + timeToText(points[p].at));
    }

    // set the last updated time...
    if( laststarttime ) {
	console.log( compno + "* assuming start at " + laststarttime + ", " + timeToText(laststarttime) );
    }

    return laststarttime;

}

function timeToText( laststarttime ) {
    var cT = new Date(0); cT.setUTCSeconds( laststarttime );
    var mins = cT.getMinutes();
    if( mins < 10 ) {
        mins = "0"+mins;
    }
    var secs = cT.getSeconds();
    if( secs < 10 ) {
	secs = "0"+secs;
    }
    return cT.getHours() + ":" + mins + ":" + secs;
}

function durationToText( elapsed ) {
    var hours = Math.trunc(elapsed/3600);
    var mins = Math.trunc((elapsed/60)%60);
    var secs = (elapsed%60);
    if( mins < 10 ) {
        mins = "0"+mins;
    }
    if( secs < 10 ) {
	secs = "0"+secs;
    }
    return hours + ":" + mins + ":" + secs;
      //    return String.format("%d:%02d:%02d",hours,mins,secs);
//    return elapsed;
}



/*
 * This is used just for scoring a task
 */

function scoreAATPoints( task, tracker, points, ll, m ) {

    // If it has finished then do nothing more, saves power
    if( tracker.utcfinish ) {
	return;
    }

//    return;

    
    // What was the last one we did to make sure the task hasn't finished
    var t = tracker.lastTurnPoint;

    // We start from the start point not the track point
    if( t == 0 || t === undefined ) {
	// if we haven't got a start yet then do nothing...
	if( ! (tracker.utcstart > 0 ) || tracker.startLocation === undefined ) {
	    return;
	}

	// Initialise everything
	tracker.sectorpoints = [];
	for( x = 0; x < task.length; x++ ) {
	    tracker.sectorpoints[x] = [];
	}
	tracker.aatGraph = new Graph();
	tracker.pointsByTime = [];
	
	// pick up where it started and make sure we have the last point on the startline.
	tracker.sectorpoints[0].push( {at:(tracker.utcstart), loc:(task[0].ll) } );
	tracker.lastProcessedTime = tracker.utcstart;
	tracker.pointsByTime[tracker.utcstart] = task[0].ll;
	t=1;
    }

    // Skip all the points we have processed
    var p = points.length-2;
    if( tracker.lastProcessedTime !== undefined ) {
	while( p >= 0 && points[p].at < tracker.lastProcessedTime ) {
	    p--;
	}
    }

    var finish = 0;
    var finishLeg = task.length-1; 
    var wasinsector = 0;
    var minNextDist = 999999;
    var minNextDistLL = undefined;
    var distanceDecreasing = 0;

    while( p >= 0 && t < task.length ) {

	// skip small distance changes to reduce the workload, should help with
	// filtering out thermals
	var pprev = p+1;
	var ptime = points[p+1].at;
	var _wasinsector = checkIsInTP( task[t], ll[p] );
	var _isinsector = _wasinsector;
	while( p > 0 &&  LatLong.distHaversine( ll[p], ll[pprev] ) < 1 && (points[p].at-ptime) < 90 && (_wasinsector >= 0) == (_isinsector>=0) ) {
	    p--;
	    _isinsector = checkIsInTP( task[t], ll[p] );
	}

	// So we can find out where they are...
	tracker.pointsByTime[points[p].at] = ll[p];

	var nextDistance;
	
	// if we are in the next sector then the previous sector is no longer valid - probably not needed
	// also confirm we have at least one point in the current sector or else we don't want to advance
        if( t != finishLeg ) {
	    if( (nextDistance = checkIsInTP( task[t+1],ll[p] )) >= 0 && tracker.sectorpoints[t].length > 0 ) {
		console.log( tracker.compno + "* in next sector, sector " + t + " has " + tracker.sectorpoints[t].length + " points in sector" );
		t++;
	    }
	    
	    // Find the closest point to the next turnpoint
	    else if( Math.abs(nextDistance) < minNextDist ) {
		minNextDist = Math.abs(nextDistance);
		//		minNextDistLL = ll[p];
		distanceDecreasing++;
	    }
	}
	
        // check if we are in the sector, these are scoring points.
	// Note it is possible to leave sector and return as long as a new sector is not done in the middle
	//        if( checkIsInTP( task[t], ll[p] ) >= 0 ) {
	if( _isinsector >= 0 ) {

	    // We either need to use the actual point, or if we are in the finish ring then we
	    // need to use the point of the finish rather than the actual
	    // we need to put this into the pointsByTime array as well otherwise we will use the wrong point
	    // to calculate distances later
	    var useP = ll[p];
	    if( t == finishLeg ) {
		useP = task[t].ll;
		tracker.pointsByTime[points[p].at] = useP; 
	    }
	    
	    // we need to add this to the graph pointing at each point in the previous sector
	    tracker.sectorpoints[t-1].forEach( function(previousPoint) {
		tracker.aatGraph.addLink( points[p].at, previousPoint.at, 1000-LatLong.distHaversine( useP, previousPoint.loc ));
	    } );
	    
	    tracker.sectorpoints[t].push( {at:points[p].at, loc:useP} );
//	    console.log( tracker.compno + "in AAT sector "+t+", point "+useP+", at "+points[p].at );
	    wasinsector = 1;
        }

	// If there were in the sector and are not any longer then treat it as going to next leg (and we are more than 10k away from the sector)
	else if ( wasinsector && t < finishLeg && _isinsector < -20 ) {
	    console.log( tracker.compno + "* has left sector " + t + " at " + points[p].at + ", sector has " + tracker.sectorpoints[t].length + " points in sector" );
//	    t++;
	    wasinsector = 0;
	}

	// Check for the finish, if it is then only one point counts and we can stop tracking
	if( t == finishLeg && tracker.sectorpoints[t].length > 0 )  {
	    tracker.utcfinish = points[p].at;
	    finish = points[p].at;
	    tracker.finish = timeToText( tracker.utcfinish );
	    tracker.utcduration = Math.max(tracker.utcfinish - tracker.utcstart,tracker.taskduration);
	    tracker.duration = durationToText( tracker.utcduration );
	    minNextDistLL = undefined;
	    minNextDist = 9999999;
	    t++;
	}

        p--;
    }

    // If the tracker has not actually finished then we need to dijkstra to a different point to get the distance
    var dpoints = [];
    var fakefinish = 0;
    
    if( ! finish ) {
	p = 0; // should be an exception
	finish = points[p].at;
	fakefinish = 1;

	// To figure out the partial time we will generate a temporary object and copy
	// the data into it, then we will add a link from current point to all the points
	// in the previous sector so we can optimise properly
	var tempGraph = new Graph;
	tempGraph.vertices = tracker.aatGraph.vertices;

	// If our last point was in a sector then we need to figure out how to score it
	// basically we need to duplicate all the points in the sector and add a link from them
	// to the end this should allow it to optimise the whole task length.  It works
	// on the assumption that the next leg starts when a single fix is put in the sector
	// though the reality is that while in a sector you are actually on two legs at the same time
	if( wasinsector ) {
	    tracker.sectorpoints[t-1].forEach( function(outerPoint) {
		tracker.sectorpoints[t-1].forEach( function(innerPoint) {
		    if( innerPoint.at != outerPoint.at ) {
			tempGraph.addLink( innerPoint.at, outerPoint.at, 1000-LatLong.distHaversine( task[t].ll, outerPoint.loc ));
		    }
		} );
	    } );
	}

	// If we are not in a sector it is a bit easier as it is just to the landout.  This is not
	// 100% correct as it..
	/// Annex A: to the point of the next Assigned Area which is nearest to the Outlanding Position,
	/// less the distance from the Outlanding Position to this nearest point
	// and this is doing it to the centre of the sector rather than the nearest point - it will be right
	// and circular sectors but not on wedges
	else {
	    tracker.sectorpoints[t-1].forEach( function(previousPoint) {
		tempGraph.addLink( points[p].at, previousPoint.at, 1000-LatLong.distHaversine( task[t].ll, previousPoint.loc ));
	    } );
	}
	
	    
	// Calculate the longest path, doesn't include the start for some reason so we'll add it
	dpoints = tempGraph.shortestPath(tracker.utcstart, finish);
	dpoints.push( ""+tracker.utcstart );

    }
    else {
	// Calculate the longest path, doesn't include the start for some reason so we'll add it
	dpoints = tracker.aatGraph.shortestPath(tracker.utcstart, finish);
	dpoints.push( ""+tracker.utcstart );
    }

    // Next step is to calculate the distances done on each leg
    // the graph contains weights only between points in consecutive sectors
    var distdone = 0;
    var hdistancedone = 0;
    var previousPoint = undefined;
    var previousTime = undefined;
    var rpPoint = undefined;
    var leg = 0;
    tracker.legspeeds = tracker.legdistances = "";

    // We get them out backwards so switch it round and iterate, each node is named after its time
    dpoints.reverse().forEach( function(at) {
	var point = tracker.pointsByTime[at];
	
	// Actual distance to the point
	var distance = previousPoint !== undefined ? LatLong.distHaversine( previousPoint, point ) : 0;
	
	// Are we finishing to a ring or a line/sector
	// We need to handle this a bit differently as we need to find the point on the finish ring that the
	// glider is scored to rather than the one it crosses
	if( leg == finishLeg && task[finishLeg].a1 != 90 ) {
	    distance -= task[finishLeg].r1;
	    point = previousPoint.destPointRad( LatLong.bearing( previousPoint, task[finishLeg].ll ), distance );
	}

	// If they have landed out then give them credit for what they have achieved
	if( leg == t && tracker.stationary ) {
	    point = previousPoint.destPointRad( LatLong.bearing( previousPoint, task[t].ll ), distance );
	}

	// Add to the map, except the end
	if( leg != t ) {
	    m.scoredpoints.push( new google.maps.LatLng( point.dlat(), point.dlong() ));
	}
		
	// And if it is the second point (ie part of a leg) then calculate the distances
	if( previousPoint !== undefined ) {
	    // Actual distance done
	    distdone += distance;

	    if( tracker.legspeeds != '' ) {
		tracker.legspeeds += ', ';
		tracker.legdistances += ', ';
	    }
	    tracker.legspeeds += leg+": "+ (Math.round( (distance * 10) / ((at - previousTime)/3600))/10) + "kph"; // kph
	    tracker.legdistances += leg+": "+ (Math.round( (distance * 10)) / 10) + "km"; // km
	    console.log( tracker.compno + "* leg " + leg + " distance " + distance + " from " + previousPoint + " to " + point + " in " + (at-previousTime) + " seconds" );
	    
	    // Handicap distance, handicap is on the next leg
	    hdistancedone += (100.0*distance)/Math.max(tracker.handicap+task[leg].hi,25);
	}

	// Increment to next point aka leg
	rpPoint = previousPoint;
	previousPoint = point;
	previousTime = at;
	leg++;
    } );

    leg--;
    tracker.lasttp = leg;
    console.log( tracker.compno + "* dij:"+(dpoints)+", distance " + distdone);
    console.log( tracker.compno + "* " + tracker.legspeeds );

    tracker.remaining = undefined;
    tracker.hremaining = undefined;
    tracker.grremaining = undefined;
    tracker.hgrremaining = undefined;

    if( ! fakefinish ) {
	// If it is a real finish then we don't need any distance remaining!
	tracker.pointsByTime = [];
	tracker.aatGraph = undefined;
	tracker.dbstatus = 'F';
    }
    else {

	// Pick up remained of current leg, don't adjust for finish ring as we want them home
	var distance = LatLong.distVincenty(ll[0],task[leg].ll);
	
	var remainingdistance = distance;
	var hremainingdistance = (100.0*distance)/Math.max(tracker.handicap+task[leg].hi,25);

	// Figure out how far home
	if( rpPoint ) {
	    var legLength = LatLong.distHaversine(rpPoint, task[leg].ll );
//	    if( leg == finishLeg && task[finishLeg].type == 'sector' && task[finishLeg].a1 == 180 ) {
//		legLength -= task[finishLeg].r1;
//	    }
	    
	    var scoredTo = LatLong.intermediatePoint(rpPoint,task[t].ll,
						     (legLength)/6371,1-(Math.min(distance,legLength)/legLength));
	    
	    m.scoredpoints.push( new google.maps.LatLng( scoredTo.dlat(), scoredTo.dlong() ));
	}

	// Add up how much is left of each leg to the finish
        for(t = leg+1; t < task.length;t++ ) {
            remainingdistance += task[t].length;
            hremainingdistance += (100.0*task[t].length)/Math.max(tracker.handicap+task[t].hi,25); // Accumulate the handicapped distance
        }

	// And update the display with this
	tracker.remaining = Math.round(remainingdistance*10)/10;
        tracker.hremaining = Math.round(hremainingdistance*10)/10;
	if( ! tracker.stationary ) {
            tracker.grremaining = Math.round((remainingdistance*1000)/(points[0].agl));
            tracker.hgrremaining = Math.round((hremainingdistance*1000)/(points[0].agl));
	}
    }

    // We can always calculate the speed and distance done
    var elapsed = (finish - tracker.utcstart)/3600;
    if( elapsed < 0 ) {
        elapsed = 1000000000000000;
    }
    console.log( tracker.compno + "* elapsed:"+elapsed+", completed:"+distdone+", utcs:"+tracker.utcstart+", utcf:"+tracker.utcfinish );
    console.log( tracker.compno + "* hdd:"+hdistancedone );

    if( tracker.datafromscoring != 'Y')
    {
	tracker.speed = undefined;
	tracker.hspeed = undefined;
	
	tracker.distancedone = distdone;
	tracker.hdistancedone = hdistancedone;
	
	// If we have a distance, the glider is not stationary or it is but  it finished
	if( tracker.distancedone > 0 && (! tracker.stationary || ! fakefinish)) {
            tracker.speed = Math.round( (distdone * 10) / elapsed )/10; // kph
            tracker.hspeed = Math.round( (hdistancedone * 10) / elapsed )/10; // kph;
	}

	if( tracker.speed > 180 || tracker.hspeed > 180 ) {
	    tracker.speed = undefined;
	    tracker.hspeed = undefined;
	}
	
	console.log( tracker.compno + "* speed:"+tracker.speed+", hspped:"+tracker.hspeed);
    }
}
