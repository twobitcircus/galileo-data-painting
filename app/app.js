/*
 creating a Express app initializing it with the HelloWorld message
 */
'use strict';

var PORT_LISTENER = process.env.PORT || 8080;

var _ = require("underscore");
var S = require("string");
var path = require('path');
var express = require('express');
var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);

var fs = require("fs");

var appConfig = require('./config/appConfig.json');
var pin_map = {};
var pin_state = {};
var last_pin_state = {};



// all environments
app.set('port', process.env.PORT || PORT_LISTENER);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser({ keepExtensions: true, uploadDir: path.join(__dirname, appConfig.directories.publicDir) }));
app.use(express.methodOverride());
app.use(express.cookieParser('my v3ry s3cr3t C00k1e k3y d0nt y0u th1nk?'));
app.use(express.session({
    secret: 'my l1ttl3 s3cret s3ss10n k3y isnt it?',
    maxAge: 3600000
}));



//routes
require('./routes/index')(app);

app.use(app.router);
app.use(express.static(path.join(__dirname, appConfig.directories.publicDir)));

app.use(function (req, res, next) {
    console.log('req.body: ' + JSON.stringify(req.body));
    next();
});

io.on('connection', function(socket){
  socket.on('pin_map', function(pin_map) {
    updatePinMap(pin_map);
  });
});

function updatePinMap(_pin_map) {
  pin_map = _pin_map;
  console.log("pin_map", pin_map);
  _.each(pin_map, function(value, pin_id) {
    if (value["mode"] == "digital") {
      console.log("about to export", pin_id);
      fs.writeFile("/sys/class/gpio/export", ""+pin_id, function(err) {
        if (!err) 
          fs.writeFileSync("/sys/class/gpio/gpio"+pin_id+"/direction", "in");
      });
    }
  });
}

function readPins() {
  last_pin_state = pin_state;
  pin_state = {};
  _.each(pin_map, function(value, pin_id) {
    if (value["mode"] == "digital") {
      pin_state[pin_id] = parseInt(S(fs.readFileSync("/sys/class/gpio/gpio"+pin_id+"/value").toString()).strip("\n").s);
    }
  });
  if (JSON.stringify(pin_state) != JSON.stringify(last_pin_state)) {
    console.log("pin_state", pin_state);
    io.emit('pin_state', pin_state);
  }
}

setInterval(readPins, 50);


// development only
if ('development' === app.get('env')) {
    app.use(express.errorHandler());
}

http.listen(app.get('port'), function(){
    console.log('listening on *:3000');
});
