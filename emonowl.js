// -----------------------------
// Load all the required modules

// Module to parse data from the OWL Intuition 
var OWL = require('owlintuition');

// Some helpful utilities for debugging
var util = require('util');

// Module for making HTTP connections
var http = require('http');

// URL parsing module
var url = require('url');

// Configuration file management
var config = require('config');

// Get the config into some handy vars
var feeds = config.get('feeds');
var nodes = config.get('nodes');
var debug = config.has('debug') && config.get('debug');

// If debug is enabled then map the log function to console.log else map it to a dummy function
var log = debug ? console.log : function () { };

// Create an instance of the OWL Intuition listener
var owl = new OWL();
log("Starting monitor");
owl.monitor();

// Handle the electricity event. 
//
// Sends the raw data from the electricity monitor. This is essentially the same data that an emonTX
// would send. 
// 
// We will pull out the three channels of data and a few other key bits of data (signal strength, 
// battery level) and send them to emonCMS.
owl.on('electricity', function( event ) {
  data = JSON.parse(event);
  log( "electricity = " + util.inspect(data, {"depth": null}) );
  packet = {
    power1: data.channels['0'][0].current,
    power2: data.channels['1'][0].current,
    signalRssi: data.signal.rssi, 
    signalLqi: data.signal.lqi,
    battery: data.battery,
    ch1Current: data.channels['0'][0].current,
    ch2Current: data.channels['1'][0].current,
    ch3Current: data.channels['2'][0].current,
    ch1Day: data.channels['0'][1].day,
    ch2Day: data.channels['1'][1].day,
    ch3Day: data.channels['2'][1].day
  }
  reportToEmon(nodes.electricity, packet);
});

// Handle the solar event
//
// A simplified version of the electricity event with just the PV generation and 
// consumption data. Zero out negative day generated values (Network OWL bug).
owl.on('solar', function( event ) {
  data = JSON.parse(event);
  log( "solar = " + util.inspect(data, {"depth": null}) );
  if (data.day[0].generated < 0) {
    data.day[0].generated = 0
  }
  packet = {
    power2: data.current[0].generating,
    ch2Current: data.current[0].generating,
    ch2Day: data.day[0].generated,
  }
  reportToEmon(nodes.solar, packet);
});


// Handle the heating event.
//
// Status data from the heating controller. Again pull out some key data and send
// to emonCMS.
owl.on('heating', function( event ) {
  data = JSON.parse(event);
  log( "heating = " + util.inspect(data, {"depth": null}) );
  packet = {
    signalRssi: data.signal.rssi, 
    signalLqi: data.signal.lqi,
    battery: data.battery,
    tempCurrent: data.temperature.current,
    tempRequired: data.temperature.required,
    state: data.temperature.state,
    flags: data.temperature.flags
  }
  reportToEmon(nodes.heating, packet);
});

// Eandle the weather event.
//
// This is info on the current weather state, just data pulled from the internet.
// We can retrieve in more detail directly from source as needed, so we will ignore 
// this.
owl.on('weather', function( event ) {
  log( "weather = " + util.inspect(JSON.parse(event), {"depth": null}) );
});

// Send data to emonCMS.
//
// Sends the packet with the passed in node ID to all the configured emonCMS servers.
function reportToEmon(node, packet)
{
  log( "node = " + node );
  log( "packet = " + util.inspect(packet, {"packet": null}) );
  for(var i = 0; i < feeds.length; i++) {
    postData(feeds[i].url, node, feeds[i].key, packet);
  }
}

// Make a HTTP connection to a particular server and send the data.
function postData(urlString, node, key, packet)
{
  urlParsed = url.parse(urlString);

  // EmonCMS does not look to like properly decoded query strings...
  var post_data = 'json='+JSON.stringify(packet)+
                  '&apikey='+key+
                  '&node='+node;
  
  log( "post_data = '" + post_data + "'");

  // An object of options to indicate where to post to
  var post_options = {
    host: urlParsed.host,
    port: '80',
    path: urlParsed.path+"?"+post_data,
    method: 'GET',
  };

  // Set up the request
  var post_req = http.request(post_options, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
        log('Response: ' + chunk);
    });
  });
  
  post_req.on('error', function(e) {
    log("Got error: " + e.message);
  });
  post_req.end();
}
