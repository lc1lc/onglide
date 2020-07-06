import next from 'next'

import { useRouter } from 'next/router'

// What do we need to render the bootstrap part of the page
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import Navbar from 'react-bootstrap/Navbar'
import Nav from 'react-bootstrap/Nav'
import NavDropdown from 'react-bootstrap/NavDropdown'


import { useState } from 'react';

// Helpers for loading contest information etc
import { useContest, usePilots, useTask, Spinner, Error } from '../lib/loaders.js';
import { TaskMap } from '../lib/taskmap.js';
import { Nbsp, Icon } from '../lib/htmlhelper.js';

import _find from 'lodash/find';
import _sortby from 'lodash/sortby';
import _clone from 'lodash/clone';

const pilotsorting = require('./pilot-sorting.js');


const baseUrl = 'https://sample.onglide.com';


// Figure out what image to display for the pilot. If they have an image then display the thumbnail for it,
// if they have a country then overlay that on the corner.
function PilotImage(props) {
    if( props.image && props.image !== '' ) {
        return <div className="ih" style={{backgroundImage: `url(${baseUrl}/images/uploaded/_${props.image}.jpg)`}}>
                   {props.country !== ''&& <div className="icountry" style={{backgroundImage: `url(${baseUrl}/globalimage/flags/${props.country}.png)`}}/>}
	       </div>
        
    }
    if( props.country !== '' ) {
        return <div className="ih" style={{backgroundImage: `url(${baseUrl}/globalimage/flags/${props.country}.png)`}}/>
    }

    return <div className="ih" style={{backgroundImage: `url(${baseUrl}/globalimage/outline.png)`}}/>
}

function RoundNumber(v) {
    if( typeof v === 'number' ) {
        v = Math.round(v*10)/10;
        if( isNaN(v) ) {
            v = undefined;
        }
    }

    if( v != '' && v != 0.0 && v != undefined && v != '00:00:00' ) {
        return v;
    }
    else {
        return null;
    }
}

function Optional(props) {
    const v = RoundNumber(props.v);
    if( v ) {
        return (<span>{props.b} {v} {props.e}</span>);
    }
    return null;
}

function Details({units,pilot}) {
    
    if( ! pilot ) {
	return null;
    }

    // If it is a landout then we need to update the static map and the landout details
    // this is a special case
    /*
      if( tracker.lolat ) {
      this.details.find('.lomap img').src=
      "//maps.googleapis.com/maps/api/staticmap?markers=color:black%7C"+
      tracker.lolat + "," +
      tracker.lolong + "&amp;size=200x200&amp;scale=2&amp;zoom=13&amp;api&amp;sensor=false";
      }
    */
    // Simplify displaying units
    const aglunit = units?'ft':'m';
    const climbunit = units?'knots':'m/s';

    const altitude =  pilot.altitude ? (<span>
                                            Altitude {pilot.altitude} {aglunit}  (AGL {pilot.agl} {aglunit})
                                        </span>) : null;

    const climb = (pilot.gainXsecond || pilot.lossXsecond) ? (<span>
                                                                  , last {pilot.Xperiod} seconds:
                                                                  <Icon type="upload"/> {pilot.gainXsecond} {aglunit}
                                                                  <Icon type="download"/> {pilot.lossXsecond} {aglunit}
                                                                  <Icon type="circle-blank"/> {pilot.averager} {climbunit}
                                                                  <br/>
                                                              </span>) : null;

    const speed = (<>
                       <Optional b="Task Speed" v={pilot.hspeed} e="kph,"/>
                       <Optional b="Actual Speed" v={pilot.speed} e="kph"/>
                   </>);

    const distance = (<>
                          <Optional b="Task Completed" v={pilot.distancedone} e=" km actual, "/>
                          <Optional b="Task Completed" v={pilot.distance} e=" km actual, "/>
                          <Optional b="(" v={pilot.hdistance} e=" km handicapped )"/>
                          <Optional b="Remaining" v={pilot.remaining} e="km actual"/>
                      </>);


    // Figure out what to show based on the db status
    let flightDetails = null;

    switch(pilot.dbstatus) {
    case '-':
    case 'G':
        flightDetails = (<div>
                             No start reported yet<br/>
                             {altitude}{climb}
                         </div>);
        break;

    case 'S':  show = 'flying'; break;
        flightDetails = (<div>
                             {altitude}{climb}
                             <br/>
                             <Optional b="Started at" v={pilot.start} e=","/>
                             <Optional b="Duration" v={pilot.duration} e={<br/>}/>

                             <br/>
                             {speed}
                             <Optional b={<>Leg Speeds<br/></>} v={pilot.legspeeds} e={<br/>}/>

                             <br/>
                             {distance}

                             <br/>
                             <Optional v={pilot.status}/>

                             <Optional b="Glide Ratio to Finish" v={pilot.grremaining} e=":1"/>
                             <Optional b=", HCap Ratio" v={pilot.hgrremaining} e=":1"/>
                         </div>);
    case 'F':
        flightDetails = (<div>
                             Finished<br/>
                             <Optional b="Started at" v={pilot.start}/>
                             <Optional b=", Finished at" v={pilot.finish}/>
                             <Optional b=", Duration" v={pilot.duration}/><br/>

                             {speed}<br/>
                             {distance}
                         </div>);
        break;
    case 'H':
        flightDetails = (<div>Home<br/>
                             <Optional b="Started at" v={pilot.start}/>
                             <Optional b=", Finished at" v={pilot.finish}/>
                             <Optional b=", Duration" v={pilot.duration}/><br/>
                             {distance}
                         </div>);
        break;

    case '/':
    case 'D':
        flightDetails = (<div>Did not fly</div>);
        break;

    default:
        flightDetails = (<div>Possible Landout<br/>
                             {altitude}
                             {distance}

                             <Optional b="Landed Near:" v={pilot.lonear}/>
                             <Optional v={pilot.status}/><br/>
                         </div>);
        break;
    }

    // Are we in coverage or not, keyed off uptodate
    const ognCoverage = pilot.uptodate ?
          (<span><Nbsp/><a href="#" title="In OGN Flarm coverage"><Icon type="check"/></a></span>) :
          (<span><Nbsp/><a href="#" title="No recent points, waiting for glider to return to coverage"><Icon type="spinner Icon-spin"/></a></span>);

    const flag = ( pilot.country !== '' ) ? <div className="details-flag" style={{backgroundImage: `url(${baseUrl}/globalimage/flags/${pilot.country}.png)`}}/> : null;

    return (
        <div className="details">
            {flag}<h6>{pilot.compno}:<b>{pilot.name}</b> {pilot.country}, {pilot.glidertype}, handicap {pilot.handicap}</h6>
            <span className="pull-right" style={{marginRight:'10px'}}>
                {ognCoverage}
            </span>
            <br/>
            {flightDetails}
        </div>
    );
}


function Sorting(props) {
    return (
        <>
            <h5>Results
                <span className="pull-right">
                    <a title="Sort Automatically" href="#" onClick={()=>props.setSort('auto')}><Icon type="star"/></a>
                    <a title="Show Speed" href="#" onClick={()=>props.setSort('speed')}><Icon type="trophy"/></a>
                    <a title="Show Height" href="#" onClick={()=>props.setSort('height')}><Icon type="cloud-upload "/>&nbsp;</a>
                    <a title="Show Current Climb Average" href="#" onClick={()=>props.setSort('climb')}><Icon type="upload "/>&nbsp;</a>
                    <a title="Show L/D Remaining" href="#" onClick={()=>props.setSort('ld')}><Icon type="fast-forward "/>&nbsp;</a>
                    <a title="Show Handicapped Distance Done" href="#" onClick={()=>props.setSort('distance')}><Icon type="signout "/>&nbsp;</a>
                    <a title="Show Handicapped Distance Remaining" href="#" onClick={()=>props.setSort('remaining')}><Icon type="signin "/>&nbsp;</a>
                    <a title="Cycle through times" href="#" onClick={()=>props.setSort('times')}><Icon type="time "/>&nbsp;</a>
                    <Nbsp/>
		    
                    <a href="#" onClick={() => props.toggleVisible()}
                       title={props.visible?"Hide Results":"Show Results"}
                       aria-controls="task-collapse"
                       aria-expanded={props.visible}>
                    <Icon type="tasks"/><Icon type="caret-down"/></a>
                </span>
            </h5>
            <div id="sortdescription">{props.sortDescription}</div>
        </>
    );
}


// Display the current height of the pilot as a percentage bar
function PilotHeightBar(props) {
    let bcolour = 'grey';
    const thirds = (props.highest - props.lowest)/3;
    // Adjust the bar on the pilot marker regardless of status
    let top = Math.min(Math.round(30/(props.highest - props.lowest) * (props.altitude - props.lowest)),30);

    if( ! props.altitude || ! props.max ) {
        top = 0;
    }
    else if( props.altitude > thirds * 2 ) {
        bcolour = 'green';
    }
    else if ( props.altitude > thirds ) {
        bcolour = 'orange';
    }
    else {
        bcolour = 'red';
    }

    return (
        <div className="height" style={{marginTop: {top}+'px', height: {top}+'px', borderColor: {bcolour}}}/>
    )
}

//
// Figure out what status the pilot is in and choose the correct icon
function PilotStatusIcon(props) {
    let icon = 'question';

    switch(props.pilot.dbstatus) {
    case '-':
    case 'G':  icon='cloud-upload'; break;

    case 'S':
        if( ! props.pilot.fastpoints && ! props.pilot.points.length ) {
            icon = 'question';
        }
        else
        {
            if( props.pilot.averager > 1 ) {
                icon = 'upload';
            }
            else {
                icon='plane';
            }
            if( props.pilot.altitude > thirds * 2 ) {
                icon = icon + ' hgreen';
            }
            else if ( props.pilot.altitude > thirds ) {
                icon = icon +' horange';
            }
            else {
                icon = icon +' hred';
            }
        }
        break;
    case 'F':  icon='trophy'; break;

    case 'H':  icon='home'; break;
    case '/':  icon='trash'; break;
    case 'D':  icon='ban-circle'; break;
    case 'R':  icon='question'; break;

    default:   icon='road'; break;
    }

    // If it is a finish and it is scored
    if( props.pilot.datafromscoring == 'Y' && props.pilot.dbstatus == 'F' ) {
        icon = 'check';
    }

    return (
        <span className="pilotstatus">
            <Icon type={icon}/>
        </span>
    );
}


//
// Render the pilot
function Pilot(props) {

    const className = (props.selected)?"small-pic pilot pilothovercapture selected":"small-pic pilot pilothovercapture";

    // Render the normal pilot icon
    return (
            <li className={className} >
                <a href="#" title={props.pilot.compno + ': ' + props.pilot.firstname + ' ' + props.pilot.lastname} onClick={()=>{props.select()}}>
                    <PilotImage image={props.pilot.image} country={props.pilot.country}/>
                    <div>
                        <PilotHeightBar pilot={props.pilot} highest="8000" lowest="0"/>

                        <div className='caption'>
                            {props.pilot.compno}
                            <PilotStatusIcon pilot={props.pilot}/>
                        </div>
                        <div>
                            <div className="data">
                                {props.pilot.displayAs}
                            </div>
                            <div className="units">
                                {props.pilot.units}
                            </div>
                        </div>
                    </div>
                </a>
            </li>
    );

}

//
// Render the list of pilots
export function PilotList({vc}) {

    // These are the rendering options
    const [ order, setOrder ] = useState( 'auto' );
    const [ visible, setVisible ] = useState( true );
    const [ selectedPilot, setSelectedPilot ] = useState( '' );

    // Load and use the pilots API to retrieve the pilots data
    const { pilots, isLoading, error } = usePilots(vc);
    if (isLoading) return <div><Spinner />{vc}</div>
    if (error) return <Error />

    // ensure they sort keys are correct for each pilot, we don't actually
    // want to change the loaded pilots file, just the order they are presented
    // this can be done with a clone and reoder
    let mutatedPilotList = _clone(pilots);
    pilotsorting.updateSortKeys( mutatedPilotList, order );

    // Generate the pilot list, sorted by the correct key
    const pilotList = _sortby(mutatedPilotList,['sortKey']).reverse()
          .map( (pilot) =>
              <Pilot key={pilot.compno} pilot={pilot} selected={selectedPilot==pilot.compno} select={()=>{setSelectedPilot(pilot.compno);}}/>
          );

    const sPilot = _find(pilots,['compno',selectedPilot]);

    // Output the whole of the pilots list component
    return (
        <>
            <Sorting setSort={(o)=>{setOrder(pilotsorting.nextSortOrder(o,order))}} sortDescription={pilotsorting.descriptions[order]}
                     visible={visible} toggleVisible={()=>{setVisible(!visible)}}/>

            <Collapse in={visible}>
                <ul className="pilots">
                    {pilotList}
                </ul>
            </Collapse>
	    
	    <Details pilot={sPilot}/>
        </>
    );
}
