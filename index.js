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
     
  // experimental
  try {
    var HomeKitTypes = Utils.getHomeKitTypes();
    this.log.debug("MqttPlattform %s", JSON.stringify(HomeKitTypes, null, 2));
    this.log.debug("MqttPlattform Number of Service_types %s", Object.keys(HomeKitTypes).length);
    this.log.debug("MqttPlattform %s", HomeKitTypes['0000008C-0000-1000-8000-0026BB765291']);
  } catch(err) {
    this.log.debug("MqttPlattform error %s", err.message);
  }
  
  plugin_version = Utils.readPluginVersion();
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
    "setAccessoryInformation": this.setAccessoryInformation.bind(this),
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
        //this.log.debug("MqttPlatform %s", JSON.stringify(this.hap_accessories[k], null, 2));
      }

      this.Mqtt.connect(this.url);
             
      this.log.debug("Number of chaced Accessories: %s", cachedAccessories);
      this.log("Number of Accessories: %s", Object.keys(this.accessories).length);

    }.bind(this));
  }
}

MqttPlatform.prototype.addAccessory = function(accessoryDef) {

  var name = accessoryDef.name;
  var service_type = accessoryDef.service;
  var service_name;
  var ack, message;
  
  // backwards compatible to v0.2.4
  if (typeof accessoryDef.service_name !== "undefined" ) {
    service_name = accessoryDef.service_name;
  } else {
    service_name = name;  
  }

  if (typeof Service[service_type] === "undefined") {
    ack = false;
    message = "service '" + service_type + "' undefined.";
  } else if (typeof this.accessories[name] !== "undefined") {
    ack = false;
    message = "name '" + name + "' is already used.";
  } else {
    var uuid = UUIDGen.generate(name);
    
    var newAccessory = new Accessory(name, uuid);
    //this.log.debug("addAccessory UUID = %s", newAccessory.UUID);
    
    var i_accessory = new MqttAccessory(this.buildParams(accessoryDef));
    
    i_accessory.addService(newAccessory, service_name, service_type);
    
    i_accessory.configureAccessory(newAccessory, service_name, service_type);
    
    i_accessory.configureIdentity(newAccessory);
    
    newAccessory.reachable = true;
    
    this.accessories[name] = i_accessory;
    this.hap_accessories[name] = newAccessory;
    this.api.registerPlatformAccessories(plugin_name, platform_name, [newAccessory]);
    
    ack = true;
    message =  "accessory '" + name + "', service_name '" + service_name + "' is added.";
  }
  
  this.log("addAccessory %s", message);
  this.Mqtt.sendAck(ack, message);
  
  if (ack) {
    var now = new Date().toISOString().slice(0,16);
    var plugin_v = "v" + plugin_version;
    this.setAccessoryInformation({"name":name,"manufacturer":"homebridge-mqtt","model": plugin_v,"serialnumber":now}, false);
  }
}

MqttPlatform.prototype.addService = function(accessoryDef) {

  var name= accessoryDef.name;
  var service_type = accessoryDef.service;
  var service_name = accessoryDef.service_name;
  
  var ack, message;
  
  if (typeof this.hap_accessories[name] === "undefined") {
    message = "accessory '" + name + "' undefined.";
    ack = false;
  } else if (typeof Service[service_type] === "undefined") {
    ack = false;
    message = "service '" + service_type + "' undefined.";
  } else if (this.accessories[name].service_namesList.indexOf(service_name) > -1) {
    message = "service_name '" + service_name + "' is already used.";
    ack = false;
  } else if (typeof this.hap_accessories[name].context.service_types === "undefined") {
    message = "Please remove the accessory '" + name + "'and add it again before adding multiple services";
    ack = false;
  } else {
    this.accessories[name].addService(this.hap_accessories[name], service_name, service_type);
          
    this.accessories[name].configureAccessory(this.hap_accessories[name], service_name, service_type);
  
    message = "service_name '" + service_name + "', service '" + service_type + "' is added.";
    ack = true;
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
  
  var ack, message;
  var name = accessory.name;
  var reachable = accessory.reachable;
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

MqttPlatform.prototype.setAccessoryInformation = function(accessory, response) {

  this.log.debug("setAccessoryInformation %s", JSON.stringify(accessory));
  var message;
  var ack = false;
  var name = accessory.name;
  
  if (typeof this.hap_accessories[name] === "undefined") {
    message = "accessory '" + name + "' undefined.";
    this.Mqtt.sendAck(false, message);
    this.log("setAccessoryInformation %s", message);
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
      this.Mqtt.sendAck(ack, message);
      this.log("setAccessoryInformation %s", message);
    }
  }
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
