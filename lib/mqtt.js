'use strict';

var mqtt = require('mqtt');
var Utils = require('./utils.js').Utils;

var plugin_name, topic_prefix, Characteristic, platform_name;
var addAccessory, addService, removeAccessory, removeService, setValue, getAccessories, updateReachability, setAccessoryInformation;
var set_timeout, client;

module.exports = {
  Mqtt: Mqtt
}

function Mqtt(params) {

  this.config = params.config;
  this.log = params.log;
  plugin_name = params.plugin_name;
  platform_name = params.platform_name;
  topic_prefix = params.topic_prefix;
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

Mqtt.prototype.connect = function(url) {

  var options = {};
  // experimental
  this.publish_options = {};
  
  options.username = this.config.username || null;
  options.password = this.config.password || null;

  this.publish_options = {retain: this.config.retain || false};
  //this.log.debug("Mqtt connect options %s", JSON.stringify(this.publish_options));
  
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
    
    client.publish(topic_prefix + '/from/connected', msg, this.publish_options);
  }.bind(this));
  
  client.on('message', function (topic, buffer) {

    var payload = buffer.toString();
    var message, accessory;
    var isValid;
    
    if (typeof topic === "undefined" || payload.length === 0) {
      message = "topic or payload invalid";
      this.log.debug("Mqtt.on messsage %s", message);
      this.sendAck(false, message);
    } else {
    
      this.log.debug("Mqtt.on topic %s payload %s", topic, payload);
      
      try {
        accessory = JSON.parse(payload);
        
        if (typeof accessory.subtype !== "undefined") {
          message = "Please replace 'subtype' by 'service_name'";
          this.log.debug("Mqtt.on messsage %s", message);
          this.sendAck(false, message);
          isValid = false;
        } else {
          isValid = true;
        }
      } catch(e) {
        message = "invalid JSON format";
        this.log.debug("Mqtt.on messsage %s (%s)", message, e.message);
        this.sendAck(false, message);
        isValid = false;
      }

      if (isValid) {
        switch (topic) {
          case topic_prefix + "/to/add":
          case topic_prefix + "/to/add/accessory":
            this.log.debug("Mqtt.on messsage add \n%s", JSON.stringify(accessory, null, 2));
            addAccessory(accessory);
            break;

          case topic_prefix + "/to/add/service":
          case topic_prefix + "/to/add/services":
            this.log.debug("Mqtt.on messsage add/service \n%s", JSON.stringify(accessory, null, 2));
            addService(accessory);
            break;

          case topic_prefix + "/to/set/reachability":
          case topic_prefix + "/to/set/reachable":
            if (typeof accessory.reachable === "boolean") {
              updateReachability(accessory);
            } else {
              message = "accessory '" + accessory.name + "' reachable not boolean.";
              this.log.warn("on messsage %s", message);
              this.sendAck(false, message);
            }
            break;
            
          case topic_prefix + "/to/set/accessoryinformation":
          case topic_prefix + "/to/set/information":
            setAccessoryInformation(accessory, true);
            break;
            
          case topic_prefix + "/to/remove":
          case topic_prefix + "/to/remove/accessory":
            removeAccessory(accessory.name);
            break;
            
          case topic_prefix + "/to/remove/service":
            removeService(accessory);
            break;
            
          case topic_prefix + "/to/set":
            setValue(accessory);
            break;

          case topic_prefix + "/to/get":
            getAccessories(accessory);
            //this.on_get(accessory);
            break;

          default:
            message = "topic '" + topic + "' unkown.";
            this.log.warn("on messsage default %s", message);
            this.sendAck(false, message);
        }
      }
    }
  }.bind(this));
  
  client.on('error', function (error) {
    this.log.error("Mqtt.error %s", error);
  }.bind(this));  
}

Mqtt.prototype.get = function(name, service_name, c, callback) {

  this.log.debug("Mqtt.get %s %s %s", name, service_name, c);
  var msg = {"name": name, "service_name": service_name, "characteristic": c};
  client.publish(topic_prefix + '/from/get', JSON.stringify(msg), this.publish_options);
  // callback(null, null);  // not used
}

Mqtt.prototype.set = function(name, service_name, c, value, callback) {
     
  this.log.debug("Mqtt.set %s %s %s %s", name, service_name, c, value);
  var msg = {"name": name, "service_name": service_name, "characteristic": c, "value": value};

  client.publish(topic_prefix + '/from/set', JSON.stringify(msg), this.publish_options);
  callback();
}

Mqtt.prototype.identify = function (name, manufacturer, model, serialnumber) {

  var msg = {"name": name, "manufacturer": manufacturer, "model": model, "serialnumber": serialnumber};
  this.log.debug("Mqtt.identify %s", JSON.stringify(msg));
  client.publish(topic_prefix + '/from/identify', JSON.stringify(msg), this.publish_options);
}

Mqtt.prototype.sendAccessories = function (accessories) {

  var msg = accessories;
  this.log.debug("Mqtt.sendAccessories \n%s", JSON.stringify(msg, null, 2));
  client.publish(topic_prefix + '/from/response', JSON.stringify(msg), this.publish_options);
}

Mqtt.prototype.sendAck = function (ack, message) {

  var msg = {"ack": ack, "message": message};
  this.log.debug("Mqtt.sendAck %s", JSON.stringify(msg));
  client.publish(topic_prefix + '/from/response', JSON.stringify(msg), this.publish_options);
}
