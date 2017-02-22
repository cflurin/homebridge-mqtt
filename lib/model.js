'use strict';

var mqtt = require('mqtt');
var Utils = require('./utils.js').Utils;

var plugin_name, topic_prefix, Characteristic;
var addAccessory, addService, removeAccessory, removeService, setValue, getAccessories, updateReachability, setAccessoryInformation;
var set_timeout, client;

module.exports = {
  Model: Model
}

function Model(params) {

  this.config = params.config;
  this.log = params.log;
  plugin_name = params.plugin_name;
  Characteristic = params.Characteristic;
  
  addAccessory = params.addAccessory;
  addService = params.addService;
  removeAccessory = params.removeAccessory;
  removeService = params.removeService;
  setValue = params.setValue;
  getAccessories = params.getAccessories;
  updateReachability = params.updateReachability;
  setAccessoryInformation = params.setAccessoryInformation;
}

Model.prototype.start = function() {

  var url = this.config.url;
  
  var options = {};
  // experimental
  this.publish_options = {};
  
  topic_prefix = this.config.topic_prefix || "homebridge";
  
  options.username = this.config.username || null;
  options.password = this.config.password || null;

  this.publish_options = {retain: this.config.retain || false};
  //this.log.debug("connect options %s", JSON.stringify(this.publish_options));
  
  if(options.username === null || options.password === null) {
    this.log("connect Anonymous");
    client = mqtt.connect(url);
  } else {
    this.log("connect Authentication with username/password");
    client = mqtt.connect(url, options);
  }
  
  var timeout = setTimeout(function() {
    if (!client.connected) {
      this.log.error("connect error! (url = %s)", url);
    }
  }.bind(this), 5000);
  
  client.on('connect', function () {
  
    this.log("connected (url = %s)", url);
    if (this.config.username) this.log.debug("on.connect %s %s", this.config.username, this.config.password);
    
    var topic = topic_prefix + '/to/#';
    client.subscribe(topic);
    this.log.debug("on.connect subscribe %s", topic);

    var plugin_version = Utils.readPluginVersion();
    var msg = plugin_name + " v" + plugin_version + " started";
    this.log.debug("on.connect %s", msg);
    
    client.publish(topic_prefix + '/from/connected', msg, this.publish_options);
  }.bind(this));
  
  client.on('message', function (topic, buffer) {

    var payload = buffer.toString();
    var message, accessory;
    var result, isValid;
    
    if (typeof topic === "undefined" || payload.length === 0) {
      message = "topic or payload invalid";
      this.log.debug("on.message %s", message);
      this.sendAck(false, message);
    } else {
    
      //this.log.debug("on.message topic %s payload %s", topic, payload);
      
      try {
        accessory = JSON.parse(payload);
        
        if (typeof accessory.subtype !== "undefined") {
          message = "Please replace 'subtype' by 'service_name'";
          this.log.debug("on.message %s", message);
          this.sendAck(false, message);
          isValid = false;
        } else {
          isValid = true;
        }
      } catch(e) {
        message = "invalid JSON format";
        this.log.debug("on.message %s (%s)", message, e.message);
        this.sendAck(false, message);
        isValid = false;
      }

      if (isValid) {
        switch (topic) {
          case topic_prefix + "/to/add":
          case topic_prefix + "/to/add/accessory":
            this.log.debug("on.message add \n%s", JSON.stringify(accessory, null, 2));
            result = addAccessory(accessory);
            this.handle(result);
            break;

          case topic_prefix + "/to/add/service":
          case topic_prefix + "/to/add/services":
            this.log.debug("on.message add/service \n%s", JSON.stringify(accessory, null, 2));
            result = addService(accessory);
            this.handle(result);
            break;

          case topic_prefix + "/to/set/reachability":
          case topic_prefix + "/to/set/reachable":
            if (typeof accessory.reachable === "boolean") {
              result = updateReachability(accessory);
              this.handle(result);
            } else {
              message = "accessory '" + accessory.name + "' reachable not boolean.";
              this.log.warn("on.message %s", message);
              this.sendAck(false, message);
            }
            break;
            
          case topic_prefix + "/to/set/accessoryinformation":
          case topic_prefix + "/to/set/information":
            result = setAccessoryInformation(accessory);
            this.handle(result);
            break;
            
          case topic_prefix + "/to/remove":
          case topic_prefix + "/to/remove/accessory":
            result = removeAccessory(accessory.name);
            this.handle(result);
            break;
            
          case topic_prefix + "/to/remove/service":
            result = removeService(accessory);
            this.handle(result);
            break;
            
          case topic_prefix + "/to/set":
            result = setValue(accessory);
            if (!result.ack) {
              this.handle(result);
            }
            break;

          case topic_prefix + "/to/get":
            result = getAccessories(accessory);
            if (result.ack) {
              this.sendAccessories(result.accessories);
            } else {
              this.handle(result);
            }
            break;

          default:
            message = "topic '" + topic + "' unkown.";
            this.log.warn("on.message default %s", message);
            this.sendAck(false, message);
        }
      }
    }
  }.bind(this));
  
  client.on('error', function (error) {
    this.log.error("on.error %s", error);
  }.bind(this));
  
  client.on('reconnect', function () {
    this.log.debug("  <to analyze> on.reconnect");
  }.bind(this));
  
  client.on('close', function () {
    this.log.debug("  <to analyze> on.close");
  }.bind(this));

  client.on('offline', function () {
    this.log.debug("  <to analyze> on.offline");
  }.bind(this));
 
}

Model.prototype.get = function(name, service_name, c, callback) {

  //this.log.debug("get '%s' '%s' '%s'", name, service_name, c);
  var msg = {"name": name, "service_name": service_name, "characteristic": c};
  client.publish(topic_prefix + '/from/get', JSON.stringify(msg), this.publish_options);
  // callback(null, null);  // not used
}

Model.prototype.set = function(name, service_name, c, value, callback) {
     
  //this.log.debug("set '%s' '%s' '%s' %s", name, service_name, c, value);
  var msg = {"name": name, "service_name": service_name, "characteristic": c, "value": value};

  client.publish(topic_prefix + '/from/set', JSON.stringify(msg), this.publish_options);
  callback();
}

Model.prototype.identify = function (name, manufacturer, model, serialnumber) {

  var msg = {"name": name, "manufacturer": manufacturer, "model": model, "serialnumber": serialnumber};
  this.log.debug("identify %s", JSON.stringify(msg));
  client.publish(topic_prefix + '/from/identify', JSON.stringify(msg), this.publish_options);
}

Model.prototype.sendAccessories = function (accessories) {

  var msg = accessories;
  this.log.debug("sendAccessories \n%s", JSON.stringify(msg, null, 2));
  client.publish(topic_prefix + '/from/response', JSON.stringify(msg), this.publish_options);
}

Model.prototype.handle = function (result) {

  this.sendAck(result.ack, result.message);
  this.log("%s %s, %s", result.topic, result.ack, result.message);
}

Model.prototype.sendAck = function (ack, message) {

  var msg = {"ack": ack, "message": message};
  //this.log.debug("sendAck %s", JSON.stringify(msg));
  client.publish(topic_prefix + '/from/response', JSON.stringify(msg), this.publish_options);
}
