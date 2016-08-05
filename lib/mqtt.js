'use strict';

var util = require('util');
var path = require('path');
var mqtt = require('mqtt');
var Utils = require('./utils.js').Utils;

var plugin_name, accessories, Characteristic, addAccessory, removeAccessory, getAccessories;
var set_timeout, client;

module.exports = {
  Mqtt: Mqtt
}

function Mqtt(params) {

  this.log = params.log;
  plugin_name = params.plugin_name;
  accessories = params.accessories;
  Characteristic = params.Characteristic;
  addAccessory = params.addAccessory;
  removeAccessory = params.removeAccessory;
  getAccessories = params.getAccessories;
}

Mqtt.prototype.connect = function(url) {

  var plugin_version = Utils.readPluginVersion();
 
  client = mqtt.connect(url);
  
  client.on('connect', function () {
   
    var topic = 'homebridge/to/#';
    client.subscribe(topic);
    this.log.debug("Mqtt.on connect subscribe %s", topic);

    var msg = plugin_name + " v" + plugin_version + " started";
    this.log.debug("Mqtt.on connect %s", msg);
    client.publish('homebridge/from/connected', msg);
  }.bind(this));
  
  client.on('message', function (topic, buffer) {

    var payload = buffer.toString();
    this.log.debug("Mqtt.on message %s", topic);
    this.log.debug("Mqtt.on message %s", payload);
        
    try {
      var accessory = JSON.parse(payload);
      
      var result = {};
    
      switch (topic) {
        case "homebridge/to/add":
          this.log.debug("Mqtt.on messsage add %s", JSON.stringify(accessory, null, 2));
          addAccessory(accessory);
          break;
          
        case "homebridge/to/remove":
          removeAccessory(accessory.name);
          break;
          
        case "homebridge/to/set":
          this.log.debug("Mqtt.on messsage set %s", JSON.stringify(accessory));
          result = this.validate(accessory);
        
          if (result.isValid) {
            accessories[accessory.name].save_and_setValue("Mqtt", accessory.characteristic, result.value);
          } else {
            this.log.warn("on messsage set %s", result.message);
            this.sendAck(false, result.message);
          }
          break;

        case "homebridge/to/get":
          var name;
          this.log.debug("Mqtt.on message get %s", JSON.stringify(accessory));
          
          if (typeof(accessory.name) !== "undefined") {
            name = accessory.name;
          } else {
            name = "*";
          }
          
          if (typeof(accessories[name]) !== "undefined" || name === "*") {
            getAccessories(name);
          } else {
            var message = "name '" + name + "' undefined.";
            this.log.warn("on message get %s", message);
            this.sendAck(false, message);
          }
          break;
          
        default:
          var message = "topic '" + topic + "' unkown.";
          this.log.warn("on messsage default %s", message);
          this.sendAck(false, message);
      }
    } catch(e) {
      var message = "payload invalid";
      this.log.debug("Mqtt.on messsage payload invalid %s", message);
      this.sendAck(false, message);
    }
  }.bind(this));
}

Mqtt.prototype.validate = function(accessory) {

  var name = accessory.name;
  var c = accessory.characteristic;
  var value = accessory.value;
  
  var isValid = false;
  var message = "";
  
  if(typeof(accessories[name]) === "undefined") {
    message = "name '" + name + "' undefined.";
  } else if (typeof(Characteristic[c]) !== "function") {
      message = "characteristic '" + c + "' undefined.";
  } else if (typeof(accessory.value) === "undefined" || accessory.value === null) {
      message = "name '" + name + "' value undefined.";
  } else if (typeof(accessories[name].service.getCharacteristic(Characteristic[c])) === "undefined"){
    message = "name '" + name + "' characteristic do not match.";
  } else {
    var result = {};
    result = accessories[name].parseValue(c, value);
    isValid = result.isValid;
    value = result.value;
    if (!isValid) {
      message = "value '" + value + "' outside range";
    } else {
      message = "name '" + name + "' is valid.";
    }
  }
  
  return {isValid: isValid, message: message, value: value};
}

Mqtt.prototype.get = function(name, c, callback) {

  //this.log.debug("Mqtt.get %s %s", name, c);
  var msg = {"name": name, "characteristic": c};
  client.publish('homebridge/from/get', JSON.stringify(msg));
  // callback(null, null);  // not used
}

Mqtt.prototype.set = function(name, c, value, callback) {
 
    var delay;
    
    switch (c) {
      case "On":
        value = (value == 0 || value == false) ? false : true;
        delay = 0;
        break;
      
      case "Brightness":
      case "TargetPosition":
      case "TargetHorizontalTiltAngle":
        delay = 300;
        break;
        
      default:
        delay = 0;
    }
    
    var msg = {"name": name, "characteristic": c, "value": value};
    
    set_timeout = setTimeout(function() {
      this.log.debug("Mqtt.set %s %s %s", name, c, value);
      client.publish('homebridge/from/set', JSON.stringify(msg));
    }.bind(this), delay);
    
    callback(); // todo error handling
}

Mqtt.prototype.sendAccessories = function (accessories) {

var msg = accessories;
this.log.debug("Mqtt.sendAccessories %s", JSON.stringify(msg, null, 2));
client.publish('homebridge/from/response', JSON.stringify(msg));
}

Mqtt.prototype.sendAck = function (ack, message) {

  var msg = {"ack": ack, "message": message};
  this.log.debug("Mqtt.sendAck %s", JSON.stringify(msg));
  client.publish('homebridge/from/response', JSON.stringify(msg));
}
