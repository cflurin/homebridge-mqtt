'use strict';

//var util = require('util');
//var path = require('path');
var mqtt = require('mqtt');
var Utils = require('./utils.js').Utils;

var plugin_name, topic_prefix, accessories, Characteristic;
var addAccessory, removeAccessory, getAccessories, updateReachability;
var set_timeout, client;

module.exports = {
  Mqtt: Mqtt
}

function Mqtt(params) {

  this.config = params.config;
  this.log = params.log;
  plugin_name = params.plugin_name;
  topic_prefix = params.topic_prefix;
  accessories = params.accessories;
  Characteristic = params.Characteristic;
  addAccessory = params.addAccessory;
  removeAccessory = params.removeAccessory;
  getAccessories = params.getAccessories;
  updateReachability = params.updateReachability;
}

Mqtt.prototype.connect = function(url) {

  var options = {};
  
  options.username = this.config.username || null;
  options.password = this.config.password || null;
  
  if(options.username === null || options.password === null) {
    this.log("Anonymous");
    client = mqtt.connect(url);
  } else {
    this.log("Authentication with username/password");
    client = mqtt.connect(url, options);
  }
  
  var timeout = setTimeout(function() {
    if (!client.connected) {
      this.log.error("connect error! (url = %s)", url);
    }
  }.bind(this), 5000);
  
  client.on('connect', function () {
  
    this.log("connected (url = %s)", url);
    this.log.debug("Mqtt.on.connect %s %s", this.config.username, this.config.password);
    
    var topic = topic_prefix + '/to/#';
    client.subscribe(topic);
    this.log.debug("Mqtt.on connect subscribe %s", topic);

    var plugin_version = Utils.readPluginVersion();
    var msg = plugin_name + " v" + plugin_version + " started";
    this.log.debug("Mqtt.on connect %s", msg);
    
    client.publish(topic_prefix + '/from/connected', msg);
  }.bind(this));
  
  client.on('message', function (topic, buffer) {

    var payload = buffer.toString();
    this.log.debug("Mqtt.on message %s", topic);
    this.log.debug("Mqtt.on message %s", payload);
        
    try {
      var accessory = JSON.parse(payload);
    
      switch (topic) {
        case topic_prefix + "/to/add":
          this.log.debug("Mqtt.on messsage add %s", JSON.stringify(accessory, null, 2));
          addAccessory(accessory);
          break;
          
        case topic_prefix + "/to/remove":
          removeAccessory(accessory.name);
          break;
          
        case topic_prefix + "/to/set":
          this.on_set(accessory);
          break;

        case topic_prefix + "/to/get":
          this.on_get(accessory);
          break;
          
        case topic_prefix + "/to/set/reachability":
        case topic_prefix + "/to/set/reachable":
          updateReachability(accessory);
          if (typeof accessories[accessory.name]  !== "undefined") {
            accessories[accessory.name].reachable = accessory.reachable;
          }
          break;
          
        default:
          var message = "topic '" + topic + "' unkown.";
          this.log.warn("on messsage default %s", message);
          this.sendAck(false, message);
      }
   
     } catch(e) {
      var message = "payload invalid";
      this.log.debug("Mqtt.on messsage %s", message);
      this.sendAck(false, message);
    }
    
  }.bind(this));
  
  client.on('error', function (error) {
    this.log.error("Mqtt.error %s", error);
  }.bind(this));  
}

Mqtt.prototype.on_get = function(accessory) {

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
}

Mqtt.prototype.on_set = function(accessory) {

  var result = {};
  
  //this.log.debug("Mqtt.on_set %s", JSON.stringify(accessory));
  result = this.validate(accessory);

  if (result.isValid) {
    accessories[accessory.name].save_and_setValue("Mqtt", accessory.characteristic, result.value);
  } else {
    this.log.warn("on messsage set %s", result.message);
    this.sendAck(false, result.message);
  }
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
  client.publish(topic_prefix + '/from/get', JSON.stringify(msg));
  // callback(null, null);  // not used
}

Mqtt.prototype.set = function(name, c, value, callback) {
     
  this.log.debug("Mqtt.set %s %s %s", name, c, value);
  var msg = {"name": name, "characteristic": c, "value": value};

  client.publish(topic_prefix + '/from/set', JSON.stringify(msg));
  callback();
}

Mqtt.prototype.sendAccessories = function (accessories) {

var msg = accessories;
this.log.debug("Mqtt.sendAccessories %s", JSON.stringify(msg, null, 2));
client.publish(topic_prefix + '/from/response', JSON.stringify(msg));
}

Mqtt.prototype.sendAck = function (ack, message) {

  var msg = {"ack": ack, "message": message};
  this.log.debug("Mqtt.sendAck %s", JSON.stringify(msg));
  client.publish(topic_prefix + '/from/response', JSON.stringify(msg));
}
