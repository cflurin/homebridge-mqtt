'use strict';

var Utils = require('./lib/utils.js').Utils;
var Controller = require('./lib/controller.js').Controller;

var HapAccessory, Service, Characteristic, UUIDGen;
var cachedAccessories = 0;

var platform_name = "mqtt";
var plugin_name = "homebridge-" + platform_name;
var storagePath;
var plugin_version;
var multiple = false;

module.exports = (api) => {
  console.log("homebridge API version: " + api.version);

  // Use api-provided handles for HB v2 compatibility
  HapAccessory = api.platformAccessory;
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  UUIDGen = api.hap.uuid; // Universally Unique IDentifier
  storagePath = api.user.storagePath();

  api.registerPlatform(plugin_name, platform_name, PluginPlatform, true);
}

function PluginPlatform(log, config, api) {

  this.log = log;
  
  if (typeof(config) === "undefined" || config === null) {
    multiple = true;
    this.log.warn("config undefined in '%s', irrelevant by multiple homebridge instances.", storagePath);
    return;
  }

  if (typeof config.url === "undefined") {
    this.log.error("url undefined. Please go to Settings and add a valid url.");
    return;
  }
  
  plugin_version = Utils.readPluginVersion();
  this.log("%s v%s", plugin_name, plugin_version);
  
  Utils.read_npmVersion(plugin_name, function(npm_version) {
    if (npm_version > plugin_version) {
      this.log("A new version %s is avaiable", npm_version);
    }
  }.bind(this));
  
  this.log.debug("storagePath = %s", storagePath);
  this.log.debug("config = %s", JSON.stringify(config));
  
  var c_parameters = {
    "config": config,
    "log": this.log,
    "plugin_name": plugin_name,
    "plugin_version": plugin_version,
    "platform_name": platform_name,
    "api": api,
    "HapAccessory": HapAccessory,
    "Characteristic": Characteristic,
    "Service": Service,
    "UUIDGen": UUIDGen
  }
  
  this.controller = new Controller(c_parameters);

  if (api) {

    api.on('didFinishLaunching', function() {
      this.log("Number of cached Accessories: %s", cachedAccessories);
      
      this.controller.start();      
    }.bind(this));
  }
}

PluginPlatform.prototype.configureAccessory = function(accessory) {
  
  //this.log.debug("configureAccessory %s", JSON.stringify(accessory, null, 2));
  cachedAccessories++;
  
  if (!multiple) {
    this.controller.configureAccessory(accessory);
  }
}
