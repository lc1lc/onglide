#!/usr/bin/env node

// Copyright 2020 (c) Melissa Jenkins
// Part of Onglide.com competition tracking service
// BSD licence but please if you find bugs send pull request to github

// Import the APRS server
const { ISSocket } = require( 'js-aprs-is' );
const { aprsParser } = require( 'js-aprs-fap' );

// Helper function
const distance = (require( '@turf/distance' )).default;
const { point } = require ( '@turf/helpers' );

// And the Websocket
const WebSocket = require('ws');

// And status display
const http = require('http');

console.log(ISSocket);

//const crypto = require('crypto');

// Helper
const fetcher = url => fetch(url).then(res => res.json());

// DB access
//const db = require('../db')
const escape = require('sql-template-strings')
const mysql = require('serverless-mysql')();
const fetch = require('node-fetch');

// lodash
const _filter = require('lodash.filter');
const _pick = require('lodash.pick');
const _map = require('lodash.map');
const _keyby = require('lodash.keyby');
const _foreach = require('lodash.foreach');
const _sortby = require('lodash.sortby');

// Handle fetching elevation and confirming size of the cache for tiles
const { getElevationOffset, getCacheSize } = require('../lib/getelevationoffset.js');

// For handling elevation data
//var tilebelt = require('@mapbox/tilebelt');
//var getPixels = require('get-pixels');


// Where is the comp based
let location = {};

let channels = {} /*EG: { 'PMSRMAM202007I': { className: 'blue', clients: [], launching: false, datecode: '070' },
                    'PMSRMAM202007H': { className: 'red', clients: [], launching: false, datecode: '070' },
                    }; */

// Associative array of all the trackers
let gliders = {}; /*EG: { 'T': { compno: 'T', className: 'blue', channel: channels['PMSRMAM202007I'] },
                    'P': { compno: 'P', className: 'blue', channel: channels['PMSRMAM202007I'] },
                    };*/
let trackers = {} /*EG: { 'F9C918': gliders['T'],
                    'D004F4': gliders['P'],
                    'ADD287': gliders['T']}; */

let activeGliders = {}


let unknownTrackers = {}; // All the ones we have seen in launch area but matched or not matched
let ddb = {}; // device_id: { ddb object }

// APRS connection
let connection = {};

// Load the current file & Get the parsed version of the configuration
const dotenv = require('dotenv').config({ path: '.env.local' })
const config = dotenv.parsed;

// Set up background fetching of the competition
async function main() {

    if (dotenv.error) {
        console.log( "New install: no configuration found, or script not being run in the root directory" );
        process.exit();
    }


    mysql.config({
        host: config.MYSQL_HOST,
        database: config.MYSQL_DATABASE,
        user: config.MYSQL_USER,
        password: config.MYSQL_PASSWORD,
        onError: (e) => { console.log(e); }
    });

    // Settings for connecting to the APRS server
    const CALLSIGN = config.NEXT_PUBLIC_SITEURL;
    const PASSCODE = -1;
    const APRSSERVER = 'aprs.glidernet.org';
    const PORTNUMBER = 14580;

    // Location comes from the competition table in the database
    location = (await mysql.query( 'SELECT lt,lg FROM competition LIMIT 1' ))[0];
    location.point = point( [location.lt, location.lg] );

    const FILTER = `r/${location.lt}/${location.lg}/250`;

    // Set the altitude offset for launching, this will take time to return
    // so there is a period when location altitude will be wrong for launches
    withElevation( location.lt, location.lg,
                   (agl) => { location.altitude = agl;console.log('SITE:'+agl) });

    // Download the list of trackers so we know who to look for
    await updateTrackers();
    await updateDDB();

    startStatusServer();

    // Connect to the APRS server
    connection = new ISSocket(APRSSERVER, PORTNUMBER, 'OG', '', FILTER );
    let parser = new aprsParser();

    // And start our websocket server
    const wss = new WebSocket.Server({ port: 8080 });

    // What to do when a client connects
    wss.on( 'connection', (ws,req) => {

        // Strip leading /
        const channel = req.url.substring(1,req.url.length);

        console.log( 'connection received for' + channel );
        if( channel in channels ) {
            channels[channel].clients.push( ws );
        }
        else {
            console.log( 'Unknown channel ' + channel );
        }

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true });
    });

    /*    wss.on('upgrade', function upgrade(request, socket, head) {
          console.log( "upgrade" );
          wss.handleUpgrade(request, socket, head, function done(ws) {
          wss.emit('connection', ws, request, client);
          console.log( "upgrade done" );
          });
          }); */

    // Handle a connect
    connection.on('connect', () => {
        connection.sendLine( connection.userLogin );
        connection.sendLine(`# ${CALLSIGN} ${config.NEXT_PUBLIC_WEBSOCKET_HOST}`);
    });

    // Handle a data packet
    connection.on('packet', (data) => {
        connection.valid = true;
        if(data.charAt(0) != '#' && !data.startsWith('user')) {
            const packet = parser.parseaprs(data);
            if( "latitude" in packet && "longitude" in packet &&
                "comment" in packet && packet.comment.substr(0,2) == 'id' ) {
                processPacket( packet );
            }
        } else {
            // Server keepalive
            console.log(data);
            if( data.match(/aprsc/) ) {
                connection.aprsc = data;
            }
        }
    });

    // Failed to connect
    connection.on('error', (err) => {
        console.log('Error: ' + err);
        connection.disconnect();
        connection.connect();
    });

    // Start the APRS connection
    connection.connect();

    // Every minute we need to do send a keepalive on the APRS link
    setInterval( function() {

        // Send APRS keep alive or we will get dumped
        connection.sendLine(`# ${CALLSIGN} ${config.NEXT_PUBLIC_WEBSOCKET_HOST}`);

        // Now download the scores and punt them out so we can mutate them into the results
        sendScores();

    }, 60*1000 );

    // And every 2.5 minutes we need to update the trackers, and confirm the APRS
    // connection has had some traffic
    setInterval( function() {

        // Re-establish the APRS connection if we haven't had anything in
        if( ! connection.valid ) {
            console.log( "failed APRS connection, retrying" );
            connection.disconnect( () => { connection.connect() } );
        }
        connection.valid = false;

        updateTrackers();
    }, 2.5*60*1000 );
}

main()
    .then("exiting");



//
// Fetch the trackers from the database
async function updateTrackers() {

    // Fetch the trackers from the database and the channel they are supposed to be in
    const classes = await mysql.query( 'SELECT class, datecode FROM compstatus' );

    // Now convert that into the main structure
    function channelName(className,datecode) {
        return (className+datecode).toUpperCase();
    }

    // Make sure the class structure is correct, this won't touch existing connections
    let newchannels = [];
    classes.forEach( (c) => {
        const channel = channels[ channelName(c.class,c.datecode) ];

        // Update the saved data with the new values
        channels[ channelName(c.class,c.datecode) ] = { clients: [], launching: false, activeGliders: {},
                                                        ...channel,
                                                        className: c.class, datecode: c.datecode,
                                                      };

        newchannels.push(channelName(c.class,c.datecode));
    });

    // Cleanup any old channels
    /*    const oldchannels = _pick( channels, newchannels  );
          Object.keys(oldchannels).forEach( (c) => {
          console.log( "closing channel "+c );
          const oc = channels[ c ];
          oc.clients.forEach( (client) => {
          if (client.readyState === WebSocket.OPEN) {
          client.close( 404, "datecode changed" );
          }
          });
          delete channels[c];
          }); */

    // Now get the trackers
    const cTrackers = await mysql.query( 'select p.compno, p.greg, trackerid, UPPER(concat(t.class,c.datecode)) channel, 0 duplicate, ' +
                                         ' p.class className ' +
                                         ' from pilots p left outer join tracker t on p.class=t.class and p.compno=t.compno left outer join compstatus c on c.class=p.class ' +
                                         '   where p.class = c.class' );

    function mergedName(t) { return t.className+'_'+t.compno; }

    // Now go through all the gliders and make sure we have linked them
    cTrackers.forEach( (t) => {

        // Spread, this will define/overwrite as needed
        gliders[mergedName(t)] = { ...gliders[mergedName(t)], ...t, greg: t?.greg?.replace(/[^A-Z0-9]/i,'') };

        // If we have a tracker for it then we need to link that as well
        if( t.trackerid && t.trackerid != 'unknown' ) {
            trackers[ t.trackerid ] = gliders[ mergedName(t) ];
        }
    });

    // Filter out anything that doesn't match the input set, doesn't matter if it matches
    // unknowns as they won't be in the trackers pick
    gliders = _pick( gliders, _map( cTrackers, (c) => mergedName(c) ));
    trackers = _pick( trackers, _map( cTrackers, 'trackerid' ));

    // identify any competition numbers that may be duplicates and mark them.  This
    // will affect how we match from the DDB
    const duplicates = await mysql.query( 'SELECT compno,count(*) count,group_concat(class) classes FROM pilots GROUP BY compno HAVING count > 1' );
    duplicates.forEach( (d) => {
        d.classes.split(',').forEach( (c) => {
            gliders[ c+'_'+d.compno ].duplicate = true;
        });
    });

}

//
// Update the DDB cache
async function updateDDB() {

    console.log( "updating ddb" );

    return fetch( "http://ddb.glidernet.org/download/?j=1")
        .then( res => res.json() )
        .then( (ddbraw) => {

            // {"devices":[{"device_type":"F","device_id":"000000","aircraft_model":"HPH 304CZ-17","registration":"OK-7777","cn":"KN","tracked":"Y","identified":"Y"},
            if( ! ddbraw.devices ) {
                console.log( "no devices in ddb" );
                return;
            }

            // Update the cache with the ids by device_id
            ddb = _keyby( ddbraw.devices, 'device_id' );
        });
}

// We need to fetch and repeat the scores for each class, enriched with vario information
// This means SWR doesn't need to timed reload which will help with how well the site redisplays
// information
async function sendScores() {

    const now = (new Date()).getTime()/1000;

    // For each channel (aka class)
    Object.values(channels).forEach( (channel) => {

        if( ! channel.clients.length ) {
            console.log( `not scoring ${channel.className} as no clients subscribed` );
            //            return;
        }

        // For sending the keepalive
        const keepAlive = {
            "keepalive":1,
            "t":timeToText(now),
            "at":now,
            "listeners":channel.clients.length,
            "airborne":channel.activeGliders.length||0,
        };
        const keepAliveMsg = JSON.stringify( keepAlive );

        // Send to each client
        channel.clients.forEach( (client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send( keepAliveMsg );
            }
            // And do ping/pong to make sure it's up
            if (client.isAlive === false) return client.terminate();
            client.isAlive = false;
            client.ping(function(){});
        });
        return;


        // Fetch the scores for latest date
        fetch( `http://${config.API_HOSTNAME}/api/${channel.className}/scoreTask`)
            .then(res => res.json())
            .then( (scores) => {

                // Make sure it's scored and sensible
                if( scores.error ) {
                    console.log( scores.error );
                    return;
                }

                if( ! scores.pilots || ! Object.keys(scores.pilots).length ) {
                    console.log( `no pilots scored for ${channel.className}` );
                    return;
                }

                // We only need to mix in the gliders that are active
                if( channel.activeGliders.length == 0 ) {
                    console.log( `${channel.className}: no activity since last scoring so do nothing` );
                    return;
                }

                // Reset for next iteration
                channel.activeGliders = {};

                // Get gliders for the class;
                //              const gliders = _pickby( gliders, (f) => f.className == channel.className );
                function mergedName(t) { return t.class+'_'+t.compno; }

                _foreach( scores.pilots, (p,k) => {
                    const glider = gliders[mergedName(p)];
                    if( ! glider ) {
                        console.log( `unable to find glider ${t.compno}` );
                        return;
                    }

                    // Mix in the last real time information
                    p.altitude = glider.altitude;
                    p.agl = glider.agl;

                    // And check to see if it has moved in the last 5 minutes, if we don't know omit the key
                    if( glider.lastTime ) {
                        p.stationary = (glider.lastTime - glider.lastMoved??glider.lastTime) > 5*60;
                    }

                    // If it is recent then we will also include vario
                    if( (now - glider.lastTime) < 60 ) {
                        [ p.lossXsecond,
                          p.gainXsecond,
                          p.average,
                          p.Xperiod,
                          p.min,
                          p.max ] = glider.lastvario;
                    }

                    p.at = glider.lastTime;
                });


                // Prepare to send
                const scoresMsg = JSON.stringify( scores );

                // Send to each client
                channel.clients.forEach( (client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send( scoresMsg );
                    }
                });

            })
            .catch(err => {
                // We still call the callback on an error as we don't want to drop the packet
                console.error(err);
            });
    });
}



//
// collect points, emit to competition db every 30 seconds
function processPacket( packet ) {

    // Flarm ID we use is last 6 characters
    const flarmId = packet.sourceCallsign.slice( packet.sourceCallsign.length - 6 );

    // Look it up, do we have a match?
    const glider = trackers[flarmId];

    if( ! glider ) {
        return checkUnknown( flarmId, packet );
    }

    // Check if the packet is late, based on previous packets for the glider
    const islate = ( glider.lastTime > packet.timestamp );
    const now = (new Date()).getTime()/1000;
    const td = now - packet.timestamp;

    // determine how far they are away
    let printedalready = 0;
    const jPoint = point( [packet.latitude, packet.longitude] );

    // Check to make sure they have moved or that it's been about 10 seconds since the last update
    // this reduces load from stationary gliders on the ground and allows us to track stationary gliders
    // better
    const distanceFromLast = glider.lastPoint ? distance( jPoint, glider.lastPoint ) : 0;
    if( distanceFromLast < 0.01 ) {
        if( (packet.timestamp - glider.lastTime) < 10 ) {
            return;
        }
    } else {
        glider.lastMoved = packet.timestamp;
    }
    glider.lastPoint = jPoint;
    glider.lastTime = packet.timestamp;
    glider.lastAlt = packet.altitude;

    // Where are we broadcasting this data
    let channel = channels[glider.channel];
    //    console.log( `${flarmId}: ${glider.compno} - ${glider.channel}` );

    // how many gliders are we tracking for this channel
    if( !'activeGliders' in channel ) {
        channel.activeGliders = {};
    }
    channel.activeGliders[glider.compno]=1;

    // Capture the fact that we are launching
    if( packet.altitude - location.altitude > 100 && ! channel.launching ) {
        console.log( `Launch detected: ${glider.compno}, class: ${glider.className}`);
        channel.launching = true;
    }

    let message = {
        g: glider.compno,
        lat: Math.floor(packet.latitude*100000)/100000,
        lng: Math.floor(packet.longitude*100000)/100000,
        alt: Math.floor(packet.altitude),
        at: packet.timestamp,
        t: timeToText(packet.timestamp),
        v: calculateVario( glider, packet.altitude, packet.timestamp ).join(','),
    };


    // Enrich with elevation and send to everybody, this is async
    withElevation( packet.latitude, packet.longitude,
                   async (agl) => {
                       message.agl = Math.max(packet.altitude-agl,0);
                       // console.log( `${glider.compno}: ${packet.latitude},${packet.longitude} - EL: ${agl}, A/C ${packet.altitude} ... ${packet.altitude-agl}` );

                       // If the packet isn't delayed then we should send it out over our websocket
                       if( ! islate ) {

                           // Prepare to send
                           const jsonMsg = JSON.stringify( message );


                           // Send to each client
                           channel.clients.forEach( (client) => {
                               if (client.readyState === WebSocket.OPEN) {
                                   client.send( jsonMsg );
                               }
                           });
                       }

                       // Pop into the database
                       mysql.query( escape`INSERT INTO trackpoints (class,datecode,compno,lat,lng,altitude,agl,t)
                                                  VALUES ( ${glider.className}, ${channel.datecode}, ${glider.compno},
                                                           ${packet.latitude}, ${packet.longitude}, ${packet.altitude}, ${agl}, ${packet.timestamp} )` );

                   });

}

function calculateVario( glider, altitude, timestamp ) {

    altitude = Math.floor(altitude);

    // First point we just initialise it with what we had
    if( ! ("vario" in glider) ) {
        glider.vario = [ { t: timestamp, a: altitude } ];
        glider.minmax = { m: altitude, x: altitude };
        return glider.lastvario = [0,0,0,0,0,0,0];
    }

    // Helpers
    let varray = glider.vario;
    let minmax = glider.minmax;

    // add the new point, we need history to calculate a moving
    // average
    varray.push( { t: timestamp, a: altitude } );

    if( altitude < minmax.m ) minmax.m = altitude;
    if( altitude > minmax.x ) minmax.x = altitude;

    // if the period is longer than 60 seconds or 40 points then drop the beginning one
    if( varray[0].t < timestamp - 60 || varray.length > 41 ) {
        varray.shift();
    }

    if( varray.length < 2 ) {
        return glider.lastvario = [0,0,0,0,0,minmax.m,minmax.x]; // this ensures we always have two points
    }

    // Figure out the gain and loss components over the time
    let loss = 0;
    let gain = 0;
    let previousAlt = -1;
    varray.forEach( (p) => {
        if( previousAlt && previousAlt > 0 ) {
            let diff = p.a - previousAlt;
            if( diff > 0 ) gain += diff;
            if( diff < 0 ) loss -= diff;
        }
        previousAlt = p.a;
    });

    // And the overall amounts
    let total = altitude - varray[0].a;
    let elapsed = timestamp - varray[0].t;

    return glider.lastvario = [ loss, gain, total, Math.floor(total/elapsed), elapsed, minmax.m, minmax.x ];
}



//
// Determine if it is close enough to the launch point to be considered launched from this site
//
function checkUnknown( flarmId, packet ) {

    const jPoint = point( [packet.latitude, packet.longitude] );
    const distanceFromHome = distance( jPoint, location.point );

    // How high are we above the airfield
    const agl = Math.max(packet.altitude-(location.altitude??0),0);

    // capture launches close to the airfield (vertically and horizontally)
    if( distanceFromHome < 300.5 && agl < 2300 ) {

        // Store in the unknown list for status display
        unknownTrackers[flarmId] = { firstTime: packet.timestamp, ...unknownTrackers[flarmId], lastTime: packet.timestamp, flarmid: flarmId };

        // Do we have it in the DDB?
        const ddbf = ddb[flarmId];

        // This works by checking what is configured in the ddb
        if( ddbf && ddbf.cn != "" ) {

            // Find all our gliders that could match, may be 0, 1 or possibly 2
            const matches = _filter( gliders, (x) => { return ((!x.duplicate) && ddbf.cn == x.compno) || ddbf.registration == x.greg } );

            if( ! Object.keys(matches).length ) {
                unknownTrackers[flarmId].message = `Not in competition ${ddbf.cn} (${ddbf.registration}) - ${ddbf.aircraft_model}`;
                return;
            }

            if( matches.length > 1 ) {
                console.log( flarmId + ": warning more than one candidate matched from ddb (" + matches.toString() + ")");
                unknownTrackers[flarmId].message = 'Multiple DDB matches '+matches.toString();
            }

            // And we will use the first one
            const match = matches[0];

            console.log( flarmId + ": matched ddb " + JSON.stringify(match) );
            unknownTrackers[flarmId].matched = `${match.compno} ${match.className} (${match.registration})`;

            // Link the two together
            match.trackerid = flarmId;
            trackers[flarmId] = match;

            // Save in the database so we will reuse them later ;)
            mysql.transaction()
                .query( escape`UPDATE tracker SET trackerid = ${flarmId} WHERE
                                      compno = ${match.compno} AND class = ${match.className} AND trackerid="unknown" limit 1` )
                .query( escape`INSERT INTO trackerhistory (compno,changed,flarmid,launchtime,method) VALUES ( ${match.compno}, now(), ${flarmId}, now(), "ognddb" )`)
                .commit();
        }

    }
}

//
// Simple webserver to display the status
//
async function startStatusServer() {
    // status display, very simple
    function displayGlider(v) {
        return v.lastTime?`<tr><td>${v.compno}</td><td>${v.className}</td><td>${timeToText(v?.lastTime)}</td><td>${v?.lastAlt}</td><td>${v?.lastvario[3]}</td></tr>`:'';
    }
    function displayUnknownTrackers(v) {
        return `<tr><td>${v.flarmid}</td><td>${v?.message??''}</td><td>${v?.matched??''}</td><td>${[timeToText(v?.firstTime),timeToText(v?.lastTime)].join(' - ')}</td>`;
    }
    function displayChannel(v) {
        return `<tr><td>${v.className}</td><td>${v?.clients?.length}</td><td>${v.launching}</td></tr>`;
    }
    function displayCache() {
        return `Terrain Cache Entries: ${getCacheSize()}<br/>DDB Entries: ${Object.keys(ddb).length}<br/>`;
    }
    http.createServer(function (req, res) {
        res.write( `<html><head><meta http-equiv="refresh" content="30"/></head><body>
                       <h1>Trackers</h1>
                         <table width="100%">
                            <thead><td>Compno</td><td>Class</td><td>Last Message</td><td>Altitude</td><td>Vario</td></thead>
                            ${_map(_sortby(gliders,'lastTime'),displayGlider).join('')}
                         </table>
                       <h2>Websockets</h2>
                         <table width="100%">
                            <thead><td>Class</td><td>Number of Clients</td><td>Launching</td></thead>
                            ${_map(channels,displayChannel).join('')}
                         </table>
                       <h2>Unkown Trackers (${Object.keys(unknownTrackers).length})</h2>
                         <table width="100%">
                            <thead><td>FlarmID</td><td>Message</td><td>Match</td><td>Time</td></thead>
                            ${_map(_sortby(unknownTrackers,'lastTime').slice(0,150),displayUnknownTrackers).join('')}
                         </table>
                      <h2>Other</h2>
                          ${displayCache()}
                          ${connection.aprsc??'unknown'}
                     </body></html>`);
        res.end(); //end the response
    }).listen(8081);
}

// Handle DEM
async function withElevation(lt,lg,cb) {
    getElevationOffset( config, lt, lg, cb );
}

function timeToText( t ) {
    if( ! t ) return '';
    var cT = new Date(0); cT.setUTCSeconds( t );
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
