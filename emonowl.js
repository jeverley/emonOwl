var OWL = require('./node-owlintuition/owl.js');
var util = require('util');
var http = require('http');
var url = require('url');
var config = require('config');
var querystring = require('querystring');

// Get the config into some handy vars
var feeds = config.get('feeds');
var nodes = config.get('nodes');

var debug = config.has('debug') && config.get('debug');
var log = debug ? console.log : function () {};

var owl = new OWL();
log("Starting monitor");
owl.monitor();

owl.on('electricity', function( event ) {
  data = JSON.parse(event);
  log( "electricity = " + util.inspect(data, {"depth": null}) );
  packet = {
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

owl.on('weather', function( event ) {
  log( "weather = " + util.inspect(JSON.parse(event), {"depth": null}) );
});

owl.on('solar', function( event ) {
  log( "solar = " + util.inspect(JSON.parse(event), {"depth": null}) );
});

function reportToEmon(node, packet)
{
  log( "node = " + node );
  log( "packet = " + util.inspect(packet, {"packet": null}) );
  for(var i = 0; i < feeds.length; i++) {
    postData(feeds[i].url, node, feeds[i].key, packet);
  }
}

function postData(urlString, node, key, packet)
{
  urlParsed = url.parse(urlString);

  // EmonCMS does not look to like properly encoded query strings...
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
