'use strict';

var PORT_LISTENER = process.env.PORT || 8080;

var _ = require("underscore");
var S = require("string");
var path = require('path');
var express = require('express');
var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);
var async = require("async");
var multer = require('multer');
var glob = require("glob");
var path = require("path");

var mraa;
try {
  var mraa = require("mraa");
} catch (e) {
  mraa = null;
}

var fs = require("fs");
var levelup = require("levelup");
var db = levelup("./labserve.db");

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
app.use(express.bodyParser({ keepExtensions: true, uploadDir: "./uploads/" }));

app.use(express.methodOverride());
app.use(express.cookieParser('my v3ry s3cr3t C00k1e k3y d0nt y0u th1nk?'));
app.use(express.session({
    secret: 'my l1ttl3 s3cret s3ss10n k3y isnt it?',
    maxAge: 3600000
}));


app.get('/', function (req, res) {
    res.render('index', {});
});
app.get('/about', function (req, res) {
    res.redirect('http://www.twobitcircus.com');
});
app.get('/pages/:page', function (req, res) {
    res.render('pages/' + req.params.page, {
    });
});
app.get('/template/:selectedTemplate', function (req, res) {
    res.render('bootstrap3-templates/' + req.params.selectedTemplate, {
        'pathToAssets': '/bootstrap-3.2.0',
        'pathToSelectedTemplateWithinBootstrap' : '/bootstrap-3.2.0/docs/examples/' + req.params.selectedTemplate
    });
});

app.post('/workspaces', function(req, res) {
  var name = req.body.name;
  var workspace = req.body.workspace;
  console.log("saving", name, workspace);
  db.put("workspace:" + name, JSON.stringify(workspace));

  res.json({});
});

app.get('/workspaces', function(req, res) {
  var rs = db.createReadStream();
  var l = []
  rs.on('data' , function (data) {
    if (data.key.indexOf("workspace:") == 0)
      l.push({"name": data.key.substr(10)});
  });
  rs.on('error', function (err) { /* handle err */ });
  rs.on('close', function () { 
    res.json(l);
  });
});

app.get('/workspaces/:name', function(req, res) {
  db.get("workspace:"+req.params.name, function (err, value) {
    if (err) {
      console.log(err);
      res.status(404).send('Not found');
    } else {
      res.set('Content-Type', 'text/xml');
      res.send(value);
    }
  });
});

app.get('/images', function(req, res) {
  var rs = db.createReadStream();
  var l = []
  rs.on('data' , function (data) {
    if (data.key.indexOf("image:") == 0)
      l.push({name: data.key.substr(6), path: data.value});
  });
  rs.on('error', function (err) { /* handle err */ });
  rs.on('close', function () { 
    res.json(l);
  });
});

app.post('/images', function(req, res) {
  if (req.files["file"]) {
    var path = "/" + req.files["file"].path;
    var name = req.files["file"].name;
    name = name.replace(/\.[^/.]+$/, "");
    console.log("saving", name, path);
    db.put("image:" + name, path);
  }
  res.json({});
});

app.use(app.router);
app.use(express.static(path.join(__dirname, appConfig.directories.publicDir)));
app.use("/uploads", express.static(__dirname + "/../uploads"));


app.use(function (req, res, next) {
    console.log('req.body: ' + JSON.stringify(req.body));
    next();
});

io.on('connection', function(socket){
  socket.on('pin_map', function(pin_map) {
    updatePinMap(pin_map);
  });
});

var digital_pin_to_gpio = {
  "D2": 32,
  "D3": 18,
  "D4": 28,
  "D5": 17,
  "D6": 24,
  "D7": 27,
  "D8": 26,
  "D9": 19,
  "D10": 16,
  "D11": 25,
  "D12": 38,
  "D13": 39
};

var digital_pin_to_mux = {
  "D2": 31,
  "D3": 30,
  "D10": 42,
  "D11": 43,
  "D12": 54,
  "D13": 55,
};

var pins = {};

function updatePinMap(_pin_map) {
  console.log("pin_map", _pin_map);
  _.each(_pin_map, function(d) {
    if (d.mode == "digital") {
      console.log("export digital", d.pin);
      if (mraa) {
        var i = parseInt(d.pin.substring(1));
        pins[d.pin] = new mraa.Gpio(i);
        pins[d.pin].dir(mraa.DIR_IN);
      }
      pin_map = _pin_map;
    } else if (d.mode == "analog" && d.pin[0] == "A") {
      console.log("export analog", d.pin);
      if (mraa) {
        var i = parseInt(d.pin.substring(1));
        pins[d.pin] = new mraa.Aio(i);
      }
      pin_map = _pin_map;
    }
  });
}

function readPins() {
  last_pin_state = pin_state;
  pin_state = {};
  _.each(pin_map, function(d) {
    if (!pins[d.pin]) return;
    if (d.mode == "digital") {
      var val =  pins[d.pin].read();
      pin_state[d.pin] = val;
    } else if (d.mode == "analog") {
      var val = pins[d.pin].readFloat();
      pin_state[d.pin] = val;
    }
  });
  if (JSON.stringify(pin_state) != JSON.stringify(last_pin_state)) {
    console.log("pin_state", pin_state);
    io.emit('pin_state', pin_state);
  }
}

setInterval(readPins, 20);


// development only
if ('development' === app.get('env')) {
    app.use(express.errorHandler());
}

http.listen(app.get('port'), function(){
    console.log('listening on *:3000');
});
