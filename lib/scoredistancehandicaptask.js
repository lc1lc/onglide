/* this is from original site, being taken to pieces */
/* Copyright(c)2007-2020, Melissa Jenkins.  All rights reserved */

import LatLong from './LatLong';

import { checkIsInTP, timeToText, durationToText } from './taskhelper.js';
import scoreSpeedTask from './lib/scorespeedtask'


export default function scoreDistanceHandicapTask( task, tracker, state, points, highesthandicap ) {

    // We need to adjust the task to have the correct characteristics for the current pilots
    // handicap
    let newTask = adjustTask( task, state, tracker.handicap, highesthandicap );

    // Once that is done it's normal scoring
    scoreSpeedTask( newTask, tracker, state, points );

    // And then we remove the handicapped speed as it's not relevant - we did the handicapping
    // in the sector size
    tracker.hspeed = tracker.speed;
    tracker.hremaining = tracker.remaining;
    tracker.hdistancedone = tracker.distancedone;
    tracker.hgrremaining = tracker.grremaining;
}


// Make a copy of the task reduced for the specified handicap
function adjustTask( task, state, handicap, highesthandicap ) {
    //
    if( state.adjustments ) {
        return state.adjustments;
    }

    // Make a new array for it
    var newTask = state.adjustments = _clone(task);

    // reduction amount (%ish)
    var maxhtaskLength = task.distance / (highesthandicap/100);
    var mytaskLength = maxhtaskLength * (handicap/100);
    var mydifference = task.distance - mytaskLength;
    var spread = 2*(newTask.legs.length-1)+2; // how many points we can spread over
    var amount = mydifference/spread;

    // how far we need to move the radius in to achieve this reduction
    var adjustment = Math.sqrt( 2*(amount*amount) );

    // Now copy over the points reducing all symmetric
    for( i = 1; i < newTask.legs.length-1; i++ ) {

        if( newTask.legs[i].type == 'sector' && newTask.legs[i].direction == 'symmetrical') {
            newTask.legs[i].r2 += adjustment;
        }
        else {
            console.log( "Invalid handicap distance task: "+newTask.legs[i].toString() );
        }
    }

    // For scoring this handicap we need to adjust our task distance as well
    newTask.distance = newTask.hdistance = mytasklength;
    return newTask;
}