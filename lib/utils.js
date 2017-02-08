'use strict';

var path = require('path');
var fs = require('fs');
var request = require('request');

var plugins_name = "plugins";
var package_json = "../package.json";
var plugin_version;
var github_version;
var npm_version;

module.exports = {
  Utils: Utils
}

function Utils() {
}

Utils.loadConfig = function(storage_path, plugin_name, config_name) {
  
  var plugin_storage_path = path.join(storage_path, plugins_name, plugin_name);
  var config_path = path.join(plugin_storage_path, config_name);
  
  // Complain and exit if config_name doesn't exist yet
  if (!fs.existsSync(config_path)) {
      console.log("Couldn't find a %s file at %s.", config_name, plugin_storage_path);
      process.exit(1);
  }
  
  // Load up the configuration file
  var config;
  try {
    //console.log("Utils.loadConfig");
    config = JSON.parse(fs.readFileSync(config_path));
  }
  catch (err) {
    console.log("There was a problem reading your %s file.", config_name);
    console.log("Please try pasting your %s file here to validate it: http://jsonlint.com", config_name);
    console.log("");
    throw err;
  }
  return config;
}

Utils.saveConfig = function(storage_path, plugin_name, config_name, data) {

  var plugin_storage_path = path.join(storage_path, plugins_name, plugin_name);
  var config_path = path.join(plugin_storage_path, config_name); // "config_test.json");

  try {
    //console.log("Utils.saveConfig %s", data);
    fs.writeFileSync(config_path, JSON.stringify(data, null, 2));
  }
  catch (err) {
    console.log("There was a problem writing your %s file.", config_name);
    throw err;
  }
}

Utils.getHomeKitTypes = function() {

  var uuid, items, service_type;
  var HomeKitTypes = {};
  
  var types_path = path.join(__dirname, '../../hap-nodejs/lib/gen/HomeKitTypes.js');
  var lines = fs.readFileSync(types_path).toString().split('\n');
  var line;
    
  for(var k in lines) {
    line = lines[k];
    
    if (line.includes("Service.") && line.includes("UUID")) {
      items = line.split(".");
      service_type = items[1];
      uuid = items[2].slice(8,44);
      //console.log(service_type);
      //console.log(uuid);
      HomeKitTypes[uuid] = service_type;
    }
  }
  return HomeKitTypes;
}

Utils.getPluginVersion = function() {
  return plugin_version;
}

Utils.get_npmVersion = function(pkg) {
  // Update version for the next call
  this.read_npmVersion(pkg, function(version) {
    npm_version = version;
  });
  return npm_version;
}

Utils.n2b = function (number) {
  return (number == 0 || number == false) ? false : true;
}

Utils.getGitHubVersion = function(pkg, github_url) {
  this.read_GitHubVersion(pkg, github_url);
  return github_version;
}

Utils.readPluginVersion = function() {
  
  var packageJSONPath = path.join(__dirname, package_json);
  var packageJSON = JSON.parse(fs.readFileSync(packageJSONPath));
  plugin_version = packageJSON.version;
  return plugin_version;
}

Utils.read_npmVersion = function(pck, callback) {
  var exec = require('child_process').exec;
  var cmd = 'npm view '+pck+' version';
  exec(cmd, function(error, stdout, stderr) {
    npm_version = stdout.trim();
    //npm_version = stdout.replace(/(\r\n|\n|\r)/gm,"");
    callback(npm_version);
    //console.log("npm_version %s", npm_version);
 });
}

Utils.readGitHubVersion = function (pkg, url) {
  
  request.get({url: url}, function(err, response, body) {
    
    if (!err && response.statusCode == 200) {
      var package_json = body.trim();
      //console.log("package.json %s", JSON.stringify(package));
      var packageJSON = JSON.parse(package_json);
      github_version = packageJSON.version;
      if (github_version > plugin_version) {
        console.log("%s a new version %s is avaiable", pkg, github_version);
      }
    }
    else {
      console.log(err);
      if (response) console.log("statusCode: %s Message: %s", response.statusCode, response.statusMessage);
    }
  });
}

/**
 * Converts an HSV color value to RGB. Conversion formula
 * adapted from https://en.wikipedia.org/wiki/HSL_and_HSV
 * Assumes h, s, and v are contained in the set [0, 1] and
 * returns rgb (FFFFFF)
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  v       The value (brigthness)
 * @return  HexNumber       The RGB representation
 */
 
Utils.hsv2rgb = function (h, s, v) {

  //console.log("h: %s s: %s v: %s", h, s, v);
  var r, g, b;
  
  if( s == 0 ) {
    r = v; g = v; b = v;
  }
  else {
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);

    switch(i % 6){
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
  }
  r = Math.round(r*255);
  g = Math.round(g*255);
  b = Math.round(b*255);
  //console.log("r: %s g: %s b: %s", r, g, b);
  return Number(0x1000000 + r*0x10000 + g*0x100 + b).toString(16).substring(1).toUpperCase();
}

/**
 * Converts an RGB color value to HSV. Conversion formula
 * adapted from https://en.wikipedia.org/wiki/HSL_and_HSV
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and v in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSV representation
 */
 
Utils.rgb2hsv = function(r, g, b) {

  r = r/255, g = g/255, b = b/255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, v = max;

  var d = max - min;
  s = max == 0 ? 0 : d / max;

  if(max == min){
      h = 0; // achromatic
  } else {
      switch(max){
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
  }

  return [h, s, v];
}
