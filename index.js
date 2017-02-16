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
var plugin_version;
var accessory_parameters;

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
  
  plugin_version = Utils.readPluginVersion();
  this.log("%s v%s", plugin_name, plugin_version);
  
  var topic_prefix = config.topic_prefix || "homebridge";
  
  var api_parameters = {
    "config": config,
    "log": this.log,
    "plugin_name": plugin_name,
    "platform_name": platform_name,
    "topic_prefix": topic_prefix,
    "accessories": this.accessories,
    "Characteristic": Characteristic,
    "addAccessory": this.addAccessory.bind(this),
    "removeAccessory": this.removeAccessory.bind(this),
    "removeService": this.removeService.bind(this),
    "getAccessories": this.getAccessories.bind(this),
    "updateReachability": this.updateReachability.bind(this),
    "setAccessoryInformation": this.setAccessoryInformation.bind(this),
    "addService": this.addService.bind(this)
  }
  
  this.createAPI(api_parameters);
  
  accessory_parameters = {
    "log": this.log,
    "platform_name": platform_name,
    "Service": Service,
    "Characteristic": Characteristic,
    "get": this.get.bind(this),
    "set": this.set.bind(this),
    "identify": this.identify.bind(this)
  };

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
        //this.log.debug("MqttPlatform %s", JSON.stringify(this.hap_accessories[k], null, 2));
      }
      this.initAPI(this.url);
             
      this.log.debug("Number of cached Accessories: %s", cachedAccessories);
      this.log("Number of Accessories: %s", Object.keys(this.accessories).length);

    }.bind(this));
  }
}

MqttPlatform.prototype.addAccessory = function(m_accessory) {

  var name = m_accessory.name;
  var service_type = m_accessory.service;
  var service_name;
  var ack, message;
  
  // backwards compatible to v0.2.4
  if (typeof m_accessory.service_name !== "undefined" ) {
    service_name = m_accessory.service_name;
  } else {
    service_name = name;  
  }

  if (typeof name === "undefined") {
    ack = false; message = "name undefined.";
    
  } else if (typeof service_type === "undefined") {
    ack = false; message = "service undefined."; 
      
  } else if (typeof service_name === "undefined") {
    ack = false; message = "service_name undefined.";
    
  } else if (typeof Service[service_type] === "undefined") {
    ack = false; message = "service '" + service_type + "' undefined.";
    
  } else if (typeof this.accessories[name] !== "undefined") {
    ack = false; message = "name '" + name + "' is already used.";
    
  } else {
    var uuid = UUIDGen.generate(name);
    
    var newAccessory = new Accessory(name, uuid);
    //this.log.debug("addAccessory UUID = %s", newAccessory.UUID);
    
    var i_accessory = new MqttAccessory(accessory_parameters);
    
    i_accessory.addService(newAccessory, service_name, service_type);
    
    i_accessory.configureAccessory(newAccessory, m_accessory, service_name, service_type);
    
    i_accessory.configureIdentity(newAccessory);
    
    newAccessory.reachable = true;
    
    this.accessories[name] = i_accessory;
    this.hap_accessories[name] = newAccessory;
    this.api.registerPlatformAccessories(plugin_name, platform_name, [newAccessory]);
    
    ack = true; message = "accessory '" + name + "', service_name '" + service_name + "' is added.";
  }
  
  this.sendAck("addAccessory", ack, message);
  
  if (ack) {
    var now = new Date().toISOString().slice(0,16);
    var plugin_v = "v" + plugin_version;
    this.setAccessoryInformation({"name":name,"manufacturer":"homebridge-mqtt","model": plugin_v,"serialnumber":now}, false);
  }
}

MqttPlatform.prototype.addService = function(m_accessory) {

  var name= m_accessory.name;
  var service_type = m_accessory.service;
  var service_name = m_accessory.service_name;
  
  var ack, message;
  
  if (typeof this.hap_accessories[name] === "undefined") {
    ack = false; message = "accessory '" + name + "' undefined.";
    
  } else if (typeof service_name === "undefined") {
    ack = false; message = "service_name undefined.";
    
  } else if (typeof service_type === "undefined") {
    ack = false; message = "service undefined.";
    
  } else if (typeof Service[service_type] === "undefined") {
    ack = false; message = "service '" + service_type + "' undefined.";
  
  } else if (this.accessories[name].service_namesList.indexOf(service_name) > -1) {
    ack = false; message = "service_name '" + service_name + "' is already used.";
  
  } else if (typeof this.hap_accessories[name].context.service_types === "undefined") {
    ack = false; message = "Please remove the accessory '" + name + "'and add it again before adding multiple services";
  
  } else {
    this.accessories[name].addService(this.hap_accessories[name], service_name, service_type);          
    this.accessories[name].configureAccessory(this.hap_accessories[name], m_accessory, service_name, service_type);
    ack = true; message = "service_name '" + service_name + "', service '" + service_type + "' is added.";
  }
  
  this.sendAck("addService", ack, message);
}

MqttPlatform.prototype.configureAccessory = function(accessory) {

  //this.log.debug("configureAccessory %s", JSON.stringify(accessory, null, 2));
  
  cachedAccessories++;
  var name = accessory.displayName;
  var uuid = accessory.UUID;
  
  if (this.accessories[name]) {
    this.log.error("configureAccessory %s UUID %s already used.", name, uuid);
    process.exit(1);
  }
  
  accessory.reachable = true;
    
  var i_accessory = new MqttAccessory(accessory_parameters);
  
  i_accessory.configureAccessory(accessory);
  i_accessory.configureIdentity(accessory);

  this.accessories[name] = i_accessory;
  this.hap_accessories[name] = accessory;
}

MqttPlatform.prototype.removeAccessory = function(name) {

  var ack, message;
  
  if (typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "accessory '" + name + "' not found.";
    
  } else {
    this.log.debug("removeAccessory '%s'", name);
    
    this.api.unregisterPlatformAccessories(plugin_name, platform_name, [this.hap_accessories[name]]);
    delete this.accessories[name];
    delete this.hap_accessories[name];
    ack = true; message = "accessory '" + name + "' is removed.";
  }
  
  this.sendAck("removeAccessory", ack, message);
}

MqttPlatform.prototype.removeService = function(m_accessory) {

  var ack, message;
  var name = m_accessory.name;
  var service_name = m_accessory.service_name;
  
  if (typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "accessory '" + name + "' not found.";
    
  } else if (typeof service_name === "undefined") {
    ack = false; message = "service_name undefined.";
  
  } else if (this.accessories[name].service_namesList.indexOf(service_name) < 0) {
    ack = false; message = "service_name '" + service_name + "' undefined.";
  
  } else if (typeof this.hap_accessories[name].getServiceByUUIDAndSubType(service_name, service_name) === "undefined") {   
    ack = false; message = "accessory '" + name + "' service_name '" + service_name + "' not found.";
  
  } else {
    this.accessories[name].removeService(service_name);
    
    //this.log.debug("removeService '%s' '%s'", name, service_name);    
    ack = true; message = "accessory '" + name + "' service_name '" + service_name + "' is removed.";
  }
  
  this.sendAck("remoceService", ack, message);
}

MqttPlatform.prototype.updateReachability = function(accessory) {
  
  var ack, message;
  var name = accessory.name;
  var reachable = accessory.reachable;
  //this.log.debug("updateReachability %s %s", name, reachable);
    
  if (typeof name === "undefined") {
    ack = false; message = "name undefined.";
    
  } else if (typeof reachable === "undefined") {
    ack = false; message = "reachable undefined.";
    
  } else if (typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "accessory '" + name + "' not found.";
  
  } else {
    this.log.debug("updateReachability '%s'", name);
    
    this.accessories[name].reachable = reachable;
    this.hap_accessories[name].updateReachability(reachable);
    
    ack = true; message = "accessory '" + name + "' reachability set to '" + reachable;
    
  }
    
  this.sendAck("updateReachability", ack, message);
}

MqttPlatform.prototype.setAccessoryInformation = function(accessory, response) {

  this.log.debug("setAccessoryInformation %s", JSON.stringify(accessory));
  var message;
  var ack = false;
  var name = accessory.name;
  
  if (typeof this.hap_accessories[name] === "undefined") {
    message = "accessory '" + name + "' undefined.";
    this.sendAck("setAccessoryInformation", ack, message);
  } else {
    var service = this.hap_accessories[name].getService(Service.AccessoryInformation);
    
    if (typeof accessory.manufacturer !== "undefined") {
      service.setCharacteristic(Characteristic.Manufacturer, accessory.manufacturer);
      ack = true;
    }
    if (typeof accessory.model !== "undefined") {
      service.setCharacteristic(Characteristic.Model, accessory.model);
      ack = true;
    }
    if (typeof accessory.serialnumber !== "undefined") {
      service.setCharacteristic(Characteristic.SerialNumber, accessory.serialnumber);
      ack = true;
    }
    
    if (response) {
      if (ack) {
        message = "accessory '" + name + "', accessoryinformation is set.";
      } else {
        message = "accessory '" + name + "', accessoryinforrmation properties undefined.";
      }
      this.sendAck("setAccessoryInformation", ack, message);      
    }
  }
}

MqttPlatform.prototype.getAccessories = function(name) {

  var accessories = {};
  var service, characteristics;
  
  switch (name) {
    case "*":
    case "all":
      for (var k in this.accessories) {
        //this.log("getAccessories %s", JSON.stringify(this.accessories[k], null, 2));
        service = this.accessories[k].service_types;
        characteristics =  this.accessories[k].i_value;
        accessories[k] = {"services": service, "characteristics": characteristics};
      }
    break;
    
    default:
      service = this.accessories[name].service_types;
      characteristics =  this.accessories[name].i_value;
      accessories[name] = {"services": service, "characteristics": characteristics};
  }

  //this.log("getAccessory %s", JSON.stringify(accessories, null, 2));
  this.sendAccessories(accessories);
}

//
// API functions
//

MqttPlatform.prototype.createAPI = function (api_parameters) {

  this.Mqtt = new Mqtt(api_parameters);
}

MqttPlatform.prototype.initAPI = function (url) {

  this.Mqtt.connect(url);
}

MqttPlatform.prototype.get = function (name, service_name, c, callback) {

  this.Mqtt.get(name, service_name, c, callback);
}

MqttPlatform.prototype.set = function (name, service_name, c, value, callback) {

  this.Mqtt.set(name, service_name, c, value, callback);
}

MqttPlatform.prototype.identify = function (name, manufacturer, model, serialnumber) {

  this.Mqtt.identify(name, manufacturer, model, serialnumber);
}

MqttPlatform.prototype.sendAccessories = function (accessories) {

  this.Mqtt.sendAccessories(accessories);
}

MqttPlatform.prototype.sendAck = function (function_name, ack, message) {

  this.Mqtt.sendAck(ack, message);
  this.log("%s %s", function_name, message);
      
}
