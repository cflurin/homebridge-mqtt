'use strict';

var mqtt = require('mqtt');
var Utils = require('./utils.js').Utils;
var fs = require('fs');

var plugin_name, topic_type, topic_prefix, Characteristic;
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
  
  topic_type = this.config.topic_type || "multiple";
  topic_prefix = this.config.topic_prefix || "homebridge";
  
  options.username = this.config.username || null;
  options.password = this.config.password || null;
  options.port     = this.config.port     || 1883;

  this.publish_options = {retain: this.config.retain || false};
  //this.log.debug("connect options %s", JSON.stringify(this.publish_options));
  
  if(this.config.cert != null) {
    options.cert = fs.readFileSync(this.config.cert);
  }
  if(this.config.key != null) {
    options.key = fs.readFileSync(this.config.key);
  }
  if(this.config.ca != null) {
    options.ca = fs.readFileSync(this.config.ca);
  }
  
  //options default values
  //options.protocolId = 'MQTT'; // 'MQIsdp';
  //options.protocolVersion = 4; // 3;
  //options.reconnectPeriod = 5000;
  //options.keepalive = 60;
  //options.clean = true;
  
  options.clientId = 'homebridge-mqtt_' + Math.random().toString(16).substr(2, 8);
  this.log("clientId = %s", options.clientId);
  
  this.log("Connecting..");
  client = mqtt.connect(url, options);
  
  // todo client.end();
  // note: the plugig doesn't get the signal, because homebridge/lib/cli.js catchs the signal first.
  
/*
  var signals = { 'SIGINT': 2, 'SIGTERM': 15 };
  Object.keys(signals).forEach(function (signal) {
    process.on(signal, function () {
      this.log("Got %s, closing mqtt-client...", signal);
      client.end();
    }.bind(this));
  }.bind(this));
*/

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
            this.handle(result, accessory.name);
            break;

          case topic_prefix + "/to/add/service":
          case topic_prefix + "/to/add/services":
            this.log.debug("on.message add/service \n%s", JSON.stringify(accessory, null, 2));
            result = addService(accessory);
            this.handle(result, accessory.name);
            break;

          case topic_prefix + "/to/set/reachability":
          case topic_prefix + "/to/set/reachable":
            if (typeof accessory.reachable === "boolean") {
              result = updateReachability(accessory);
              this.handle(result, accessory.name);
            } else {
              message = "accessory '" + accessory.name + "' reachable not boolean.";
              this.log.warn("on.message %s", message);
              this.sendAck(false, message);
            }
            break;
            
          case topic_prefix + "/to/set/accessoryinformation":
          case topic_prefix + "/to/set/information":
            result = setAccessoryInformation(accessory);
            this.handle(result, accessory.name);
            break;
            
          case topic_prefix + "/to/remove":
          case topic_prefix + "/to/remove/accessory":
            result = removeAccessory(accessory.name);
            this.handle(result, accessory.name);
            break;
            
          case topic_prefix + "/to/remove/service":
            result = removeService(accessory);
            this.handle(result, accessory.name);
            break;
            
          case topic_prefix + "/to/set":
            result = setValue(accessory);
            if (!result.ack) {
              this.handle(result, accessory.name);
            }
            break;

          case topic_prefix + "/to/get":
            result = getAccessories(accessory);
            if (result.ack) {
              this.sendAccessories(result.accessories, accessory.name);
            } else {
              this.handle(result, accessory.name);
            }
            break;

          default:
            message = "topic '" + topic + "' unknown.";
            this.log.warn("on.message default %s", message);
            this.sendAck(false, message);
        }
      }
    }
  }.bind(this));

  client.on('close', function () {
    this.log.warn("on.close <to analyze>");
    // todo
    //this.log("mqtt-client closed, shutting down Homebridge...");
    //process.exit();
  }.bind(this));
    
  client.on('error', function (error) {
    this.log.error("on.error %s", error);
  }.bind(this));
  
  client.on('reconnect', function () {
    this.log.warn("on.reconnect <to analyze>");
  }.bind(this));


  client.on('offline', function () {
    this.log.warn("on.offline <to analyze>");
  }.bind(this));
 
}

Model.prototype.get = function(name, service_name, c, callback) {

  //this.log.debug("get '%s' '%s' '%s'", name, service_name, c);
  var msg = {"name": name, "service_name": service_name, "characteristic": c};
  var topic = this.buildTopic('/from/get', name);
  client.publish(topic, JSON.stringify(msg), this.publish_options);
  // callback(null, null);  // not used
}

Model.prototype.set = function(name, service_name, c, value, callback) {
     
  //this.log.debug("set '%s' '%s' '%s' %s", name, service_name, c, value);
  var msg = {"name": name, "service_name": service_name, "characteristic": c, "value": value};
  var topic = this.buildTopic('/from/set', name);
  client.publish(topic, JSON.stringify(msg), this.publish_options);
  callback();
}

Model.prototype.identify = function (name, manufacturer, model, serialnumber, firmwarerevision) {

  var msg = {"name": name, "manufacturer": manufacturer, "model": model, "serialnumber": serialnumber, "firmwarerevision": firmwarerevision};
  //this.log.debug("identify %s", JSON.stringify(msg));
  var topic = this.buildTopic('/from/identify', name);
  client.publish(topic, JSON.stringify(msg), this.publish_options);
}

Model.prototype.sendAccessories = function (accessories, name) {

  var msg = accessories;
  this.log.debug("sendAccessories \n%s", JSON.stringify(msg, null, 2));
  var topic = this.buildTopic('/from/response', name);
  client.publish(topic, JSON.stringify(msg), this.publish_options);
}

Model.prototype.handle = function (result, name) {

  this.sendAck(result.ack, result.message, name);
  this.log("%s %s, %s", result.topic, result.ack, result.message);
}

Model.prototype.sendAck = function (ack, message, name) {

  var msg = {"ack": ack, "message": message};
  //this.log.debug("sendAck %s", JSON.stringify(msg));
  var topic = this.buildTopic('/from/response', name);
  client.publish(topic, JSON.stringify(msg), this.publish_options);
}

Model.prototype.buildTopic = function(topic_section, name) {
  var topic;
  if (topic_type == "single") {
    topic = topic_prefix + topic_section + '/' + name;
  } else {
    topic = topic_prefix + topic_section;
  }
  this.log.debug("buildTopic %s", topic);
  return (topic);
}
