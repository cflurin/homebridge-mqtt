'use strict';

var util = require('util');
var Utils = require('./lib/utils.js').Utils;
var MqttAccessory = require('./lib/accessory.js').Accessory;
var Mqtt = require('./lib/mqtt.js').Mqtt;

var Accessory, Service, Characteristic, UUIDGen;
var cachedAccessories = 0;

var platform_name = "mqtt";
var plugin_name = "homebridge-" + platform_name;
var storagePath;

module.exports = function(homebridge) {
  console.log("homebridge API version: " + homebridge.version);
  
  Accessory = homebridge.platformAccessory;
  
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid; // Universally Unique IDentifier
  
  storagePath = homebridge.user.storagePath();
    
  homebridge.registerPlatform(plugin_name, platform_name, MqttPlatform, true);
}

function MqttPlatform(log, config, api) {

  this.log = log;
  this.accessories = {};
  this.hap_accessories = {};
  
  this.log.debug("storagePath = %s", storagePath);
  this.log.debug("config = %s", JSON.stringify(config));
  
  if (typeof(config) !== "undefined" && config !== null) {
    this.url = config.url;
  } else {
    this.log.error("config undefined or null!");
    this.log("storagePath = %s", storagePath);
    process.exit(1);
  }
     
  var plugin_version = Utils.readPluginVersion();
  this.log("%s v%s", plugin_name, plugin_version);
  
  var topic_prefix = config.topic_prefix || "homebridge";
  
  var params = {
    "config": config,
    "log": this.log,
    "plugin_name": plugin_name,
    "topic_prefix": topic_prefix,
    "accessories": this.accessories,
    "Characteristic": Characteristic,
    "addAccessory": this.addAccessory.bind(this),
    "removeAccessory": this.removeAccessory.bind(this),
    "getAccessories": this.getAccessories.bind(this),
    "updateReachability": this.updateReachability.bind(this),
    "addService": this.addService.bind(this)
  }
  this.Mqtt = new Mqtt(params);

  Utils.read_npmVersion(plugin_name, function(npm_version) {
    if (npm_version > plugin_version) {
      this.log("A new version %s is avaiable", npm_version);
    }
  }.bind(this));

  if (api) {
    this.api = api;

    this.api.on('didFinishLaunching', function() {
      this.log("Plugin - DidFinishLaunching");
      
      for (var k in this.accessories) {
        this.accessories[k].getService_names(this.hap_accessories[k]);
      }
     
      this.Mqtt.connect(this.url);
             
      this.log.debug("Number of chaced Accessories: %s", cachedAccessories);
      this.log("Number of Accessories: %s", Object.keys(this.accessories).length);

    }.bind(this));
    //this.log.debug("MqttPlatform %s", JSON.stringify(this.accessories));
  }
}

MqttPlatform.prototype.addAccessory = function(accessoryDef) {

  var name = accessoryDef.name;
  var service_type = accessoryDef.service;
  var service_name;
  var ack, message;
  var isValid;
  
  // v0.2.4 backwards compatibility
  if (typeof accessoryDef.service_name !== "undefined" ) {
    service_name = accessoryDef.service_name;
  } else {
    service_name = name;  
  }

  if (!this.accessories[name]) {
    var uuid = UUIDGen.generate(name);
    
    var newAccessory = new Accessory(name, uuid);
    newAccessory.reachable = true;
    
    //this.log.debug("addAccessory UUID = %s", newAccessory.UUID);
    
    var i_accessory = new MqttAccessory(this.buildParams(accessoryDef));
    
    isValid = i_accessory.addService(newAccessory, service_name, service_type);
    
    if (isValid) {
      i_accessory.configureAccessory(newAccessory, service_name, service_type);
      
      i_accessory.configureIdentity(newAccessory);
      
      this.accessories[name] = i_accessory;
      this.hap_accessories[name] = newAccessory;
      this.api.registerPlatformAccessories(plugin_name, platform_name, [newAccessory]);
      
      ack = true;
      message =  "accessory '" + name + "', service_name '" + service_name + "' is added.";
    } else {
      ack = false;
      message = "service '" + service_type + "' undefined.";
    }
  } else {
    ack = false;
    message = "name '" + name + "' is already used.";
  }
  this.log("addAccessory %s", message);
  this.Mqtt.sendAck(ack, message);
}

MqttPlatform.prototype.addService = function(accessoryDef) {

  var name= accessoryDef.name;
  var service_type = accessoryDef.service;
  var service_name = accessoryDef.service_name;
  
  var ack, message;
  var isValid;
  
  //this.log.debug("addService %s service_type %s", JSON.stringify(accessory), service_type);
  
  if (typeof this.hap_accessories[name] === "undefined") {
    message = "accessory '" + name + "' undefined.";
    ack = false;
    // todo
  //} else if (typeof this.hap_accessories[name].services[1].service_name === "undefined") {
  //  message = "Please remove the accessory '" + name + "'and add it again before adding multiple services";
  //  ack = false;
  } else if (this.accessories[name].service_namesList.indexOf(service_name) > -1) {
    message = "service_name '" + service_name + "' is already used.";
    ack = false;
  } else {
    isValid = this.accessories[name].addService(this.hap_accessories[name], service_name, service_type);
          
    if (isValid) {
      this.accessories[name].configureAccessory(this.hap_accessories[name], service_name, service_type);
    
      message = "service '" + service_type + "', service_name '" + service_name + "' is added.";
      ack = true;
    } else {
      message = "service '" + service_type + "' undefined.";
      ack = false;
    }
  }
  
  this.log("addService %s", message);
  this.Mqtt.sendAck(ack, message);
}

MqttPlatform.prototype.configureAccessory = function(accessory) {

  //this.log.debug("configureAccessory %s", JSON.stringify(accessory, null, 2));
  
  cachedAccessories++;
  var name = accessory.displayName;
  var uuid = accessory.UUID;
  
  var accessoryDef = {};
  accessoryDef.name = name;
  
  if (this.accessories[name]) {
    this.log.error("configureAccessory %s UUID %s already used.", name, uuid);
    process.exit(1);
  }
  
  accessory.reachable = true;
    
  var i_accessory = new MqttAccessory(this.buildParams(accessoryDef));
  
  i_accessory.configureAccessory(accessory);
  i_accessory.configureIdentity(accessory);

  this.accessories[name] = i_accessory;
  this.hap_accessories[name] = accessory;
}

MqttPlatform.prototype.removeAccessory = function(name) {

  var ack, message;
  
  if (typeof(this.accessories[name]) !== "undefined") {
    this.log.debug("removeAccessory '%s'", name);
    
    this.api.unregisterPlatformAccessories(plugin_name, platform_name, [this.hap_accessories[name]]);
    delete this.accessories[name];
    delete this.hap_accessories[name];
    ack = true;
    message = "accessory '" + name + "' is removed.";
  } else {
    ack = false;
    message = "accessory '" + name + "' not found.";
  }
  this.log("removeAccessory %s", message);
  this.Mqtt.sendAck(ack, message);
}

MqttPlatform.prototype.updateReachability = function(accessory) {
  
  var name, reachable, ack, message;
  name = accessory.name;
  reachable = accessory.reachable;
  //this.log.debug("updateReachability %s %s", name, reachable);
    
  if (typeof(this.accessories[name]) !== "undefined") {
    this.log.debug("updateReachability '%s'", name);
    
    this.accessories[name].reachable = reachable;
    this.hap_accessories[name].updateReachability(reachable);
    
    ack = true;
    message = "accessory '" + name + "' reachability set to '" + reachable;
  } else {
    ack = false;
    message = "accessory '" + name + "' not found."; 
  }
  this.log("updateReachability %s", message);
  this.Mqtt.sendAck(ack, message);
}

MqttPlatform.prototype.getAccessories = function(name) {

  var accessories = {};
  var def = {};
  var service, characteristics;
  
  switch (name) {
    case "*":
    case "all":
      for (var k in this.accessories) {
        //this.log("getAccessories %s", JSON.stringify(this.accessories[k], null, 2));
        service = this.accessories[k].service_types;
        characteristics =  this.accessories[k].i_value;
        def = {"services": service, "characteristics": characteristics};
        accessories[k] = def;
      }
    break;
    
    default:
      service = this.accessories[name].service_types;
      characteristics =  this.accessories[name].i_value;
      def = {"services": service, "characteristics": characteristics};
      accessories[name] = def;
  }

  //this.log("getAccessory %s", JSON.stringify(accessories, null, 2));
  this.Mqtt.sendAccessories(accessories);
}

MqttPlatform.prototype.buildParams = function (accessoryDef) {

  var params = {
    "accessoryDef": accessoryDef,
    "log": this.log,
    "Service": Service,
    "Characteristic": Characteristic,
    "Mqtt": this.Mqtt
  }
  //this.log.debug("configureAccessories %s", JSON.stringify(params.accessory_config));
  return params;
}


