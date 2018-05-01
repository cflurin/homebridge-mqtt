'use strict';

var Utils = require('./utils.js').Utils;
var Accessory = require('./accessory.js').Accessory;
var Model = require('./model.js').Model;

var config, plugin_name, plugin_version, platform_name;
var api, HapAccessory, Service, Characteristic, UUIDGen;

var accessory_parameters;

module.exports = {
  Controller: Controller
}

function Controller(params) {

  config = params.config;
  this.log = params.log;
  plugin_name = params.plugin_name;
  plugin_version = params.plugin_version;
  platform_name = params.platform_name; 
  api = params.api; 
  HapAccessory = params.HapAccessory;
  Service = params.Service;
  Characteristic = params.Characteristic;
  UUIDGen = params.UUIDGen;

  this.accessories = {};
  this.hap_accessories = {};
  
  var model_parameters = {
    "config": config,
    "log": this.log,
    "plugin_name": plugin_name,
    "Characteristic": Characteristic,
    "addAccessory": this.addAccessory.bind(this),
    "addService": this.addService.bind(this),
    "removeAccessory": this.removeAccessory.bind(this),
    "removeService": this.removeService.bind(this),
    "setValue": this.setValue.bind(this),
    "getAccessories": this.getAccessories.bind(this),
    "updateReachability": this.updateReachability.bind(this),
    "setAccessoryInformation": this.setAccessoryInformation.bind(this)
  };
  
  this.createModel(model_parameters);
  
  accessory_parameters = {
    "log": this.log,
    "platform_name": platform_name,
    "Service": Service,
    "Characteristic": Characteristic,
    "get": this.get.bind(this),
    "set": this.set.bind(this),
    "identify": this.identify.bind(this)
  };
}

Controller.prototype.addAccessory = function(api_accessory) {

  var name = api_accessory.name;
  var service_type = api_accessory.service;
  var manufacturer = api_accessory.manufacturer;
  var model = api_accessory.model;
  var serialnumber = api_accessory.serialnumber;
  var firmwarerevision = api_accessory.firmwarerevision;
  var service_name;
  var ack, message;
  
  // backwards compatible
  if (typeof api_accessory.service_name !== "undefined" ) {
    service_name = api_accessory.service_name;
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
    
    var newAccessory = new HapAccessory(name, uuid);
    //this.log.debug("Controller.addAccessory UUID = %s", newAccessory.UUID);
    
    var i_accessory = new Accessory(accessory_parameters);
    
    i_accessory.addService(newAccessory, service_name, service_type);
    
    i_accessory.configureAccessory(newAccessory, api_accessory, service_name, service_type);
    
    i_accessory.configureIdentity(newAccessory);
    
    newAccessory.reachable = true;
    
    this.accessories[name] = i_accessory;
    this.hap_accessories[name] = newAccessory;
    api.registerPlatformAccessories(plugin_name, platform_name, [newAccessory]);
    
    ack = true; message = "accessory '" + name + "', service_name '" + service_name + "' is added.";
  }
  
  if (ack) {
    var now = new Date().toISOString().slice(0,16);
    var plugin_v = "v" + plugin_version;
    if (typeof manufacturer === "undefined") {
      manufacturer = plugin_name;
    }
    if (typeof model === "undefined") {
      model = plugin_v;
    }
    if (typeof serialnumber === "undefined") {
      serialnumber = now;
    }
    if (typeof firmwarerevision === "undefined") {
      firmwarerevision = plugin_version;
    }
    this.setAccessoryInformation({"name":name,"manufacturer":manufacturer,"model":model,"serialnumber":serialnumber,"firmwarerevision":firmwarerevision}, false);
  }
  
  return {"topic": "addAccessory", "ack": ack, "message": message};
}

Controller.prototype.addService = function(api_accessory) {

  var name= api_accessory.name;
  var service_type = api_accessory.service;
  var service_name = api_accessory.service_name;
  
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
    this.accessories[name].configureAccessory(this.hap_accessories[name], api_accessory, service_name, service_type);
    ack = true; message = "name '" + name + "', service_name '" + service_name + "', service '" + service_type + "' is added.";
  }
  
  return {"topic": "addService", "ack": ack, "message": message};
}

Controller.prototype.configureAccessory = function(accessory) {

  //this.log.debug("Controller.configureAccessory %s", JSON.stringify(accessory, null, 2));
  
  var name = accessory.displayName;
  var uuid = accessory.UUID;
  
  if (this.accessories[name]) {
    this.log.error("Controller.configureAccessory %s UUID %s already used.", name, uuid);
    process.exit(1);
  }
  
  accessory.reachable = true;
    
  var i_accessory = new Accessory(accessory_parameters);
  
  i_accessory.configureAccessory(accessory);
  i_accessory.configureIdentity(accessory);

  this.accessories[name] = i_accessory;
  this.hap_accessories[name] = accessory;
}

Controller.prototype.removeAccessory = function(name) {

  var ack, message;
  
  if (typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "accessory '" + name + "' not found.";
    
  } else {
    this.log.debug("Controller.removeAccessory '%s'", name);
    
    api.unregisterPlatformAccessories(plugin_name, platform_name, [this.hap_accessories[name]]);
    delete this.accessories[name];
    delete this.hap_accessories[name];
    ack = true; message = "accessory '" + name + "' is removed.";
  }
  
  return {"topic": "removeAccessory", "ack": ack, "message": message};
}

Controller.prototype.removeService = function(api_accessory) {

  var ack, message;
  var name = api_accessory.name;
  var service_name = api_accessory.service_name;
  
  if (typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "accessory '" + name + "' not found.";
    
  } else if (typeof service_name === "undefined") {
    ack = false; message = "service_name undefined.";
  
  } else if (this.accessories[name].service_namesList.indexOf(service_name) < 0) {
    ack = false; message = "accessory '" + name + "', service_name '" + service_name + "' undefined.";
  
  } else if (typeof this.hap_accessories[name].getServiceByUUIDAndSubType(service_name, service_name) === "undefined") {   
    ack = false; message = "accessory '" + name + "', service_name '" + service_name + "' not found.";
  
  } else {
    this.hap_accessories[name].removeService(this.accessories[name].services[service_name]);
    this.accessories[name].removeService(service_name);
    
    //this.log.debug("Controller.removeService '%s' '%s'", name, service_name);
    ack = true; message = "accessory '" + name + "' service_name '" + service_name + "' is removed.";
  }

  return {"topic": "removeService", "ack": ack, "message": message};  
}

Controller.prototype.updateReachability = function(accessory) {
  
  var ack, message;
  var name = accessory.name;
  var reachable = accessory.reachable;
  //this.log.debug("Controller.updateReachability %s %s", name, reachable);
    
  if (typeof name === "undefined") {
    ack = false; message = "name undefined.";
    
  } else if (typeof reachable === "undefined") {
    ack = false; message = "reachable undefined.";
    
  } else if (typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "accessory '" + name + "' not found.";
  
  } else {
    this.log.debug("Controller.updateReachability '%s'", name);
    
    this.accessories[name].reachable = reachable;
    this.hap_accessories[name].updateReachability(reachable);
    
    ack = true; message = "accessory '" + name + "' reachability set to " + reachable;
  }

  return {"topic": "updateReachability", "ack": ack, "message": message};
}

Controller.prototype.setAccessoryInformation = function(accessory) {

  this.log.debug("Controller.setAccessoryInformation %s", JSON.stringify(accessory));
  var message;
  var ack;
  var name = accessory.name;
  
  if (typeof this.hap_accessories[name] === "undefined") {
    ack = false; message = "accessory '" + name + "' undefined.";
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
    if (typeof accessory.firmwarerevision !== "undefined") {
      service.setCharacteristic(Characteristic.FirmwareRevision, accessory.firmwarerevision);
      ack = true;
    }
    
    if (ack) {
      message = "accessory '" + name + "', accessoryinformation is set.";
    } else {
      message = "accessory '" + name + "', accessoryinforrmation properties undefined.";
    } 
  }
  
  return {"topic": "setAccessoryInformation", "ack": ack, "message": message};
}

Controller.prototype.getAccessories = function(api_accessory) {

  var name;
  var accessories = {};
  var service, characteristics;
  var ack, message;
  
  if (typeof api_accessory.name !== "undefined") {
    name = api_accessory.name;
  } else {
    name = "*";
  }
  
  if (name !== "*" && typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "name '" + name + "' undefined.";
    
  } else {
    switch (name) {
      case "*":
      case "all":
        for (var k in this.accessories) {
          //this.log.debug("Controller.getAccessories %s", JSON.stringify(this.accessories[k], null, 2));
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
    ack = true; message = "name '" + name + "' valid.";
  }
  
  return {"topic": "getAccessories", "ack": ack, "message": message, "accessories": accessories};
}

//
// Model functions
//

Controller.prototype.createModel = function (model_parameters) {

  this.Model = new Model(model_parameters);
}

Controller.prototype.start = function () {
 
  this.log.debug("Controller.start");
  this.Model.start();
}

Controller.prototype.get = function (name, service_name, c, callback) {

  this.Model.get(name, service_name, c, callback);
}

Controller.prototype.set = function (name, service_name, c, value, callback) {

  this.Model.set(name, service_name, c, value, callback);
}

Controller.prototype.setValue = function (api_accessory) {

  var ack, message;
  var result = {};
  
  result = this.validate(api_accessory);
  
  if (!result.isValid) {
    ack = false; message = result.message;
    this.log.debug("Controller.setValue %s", message);
  
  } else {
    result = this.accessories[api_accessory.name].save_and_setValue(platform_name, result.service_name, api_accessory.characteristic, result.value);
    
    if (!result.isValid) {
      ack = false; message = "name '" + api_accessory.name + "', value '" + result.value + "' outside range";
      this.log.debug("Controller.setValue %s", message);
          
    } else {
      ack = true; message = "name '" + api_accessory.name + "' valid.";
    }
  }
  //this.log.debug("Controller.setValue %s %s", ack, message);
  return {"topic": "setValue", "ack": ack, "message": message};
}

Controller.prototype.identify = function (name) {

  var manufacturer = this.hap_accessories[name].getService(Service.AccessoryInformation).getCharacteristic("Manufacturer").value;
  var model = this.hap_accessories[name].getService(Service.AccessoryInformation).getCharacteristic("Model").value;
  var serialnumber = this.hap_accessories[name].getService(Service.AccessoryInformation).getCharacteristic("Serial Number").value;
  var firmwarerevision = this.hap_accessories[name].getService(Service.AccessoryInformation).getCharacteristic("Firmware Revision").value;

  this.log("identify name '%s' manufacturer '%s' model '%s' serialnumber '%s' firmwarerevision '%s'", name, manufacturer, model, serialnumber, firmwarerevision);
    
  this.Model.identify(name, manufacturer, model, serialnumber, firmwarerevision);
}

Controller.prototype.validate = function(api_accessory) {

  var name = api_accessory.name;
  var service_name = api_accessory.service_name;
  var c = api_accessory.characteristic;
  var value = api_accessory.value;
  
  var ack;
  var message = "";
  
  // backwards compatible
  if (typeof service_name === "undefined") {
    service_name = name;
    if (typeof this.accessories[name] !== "undefined" && typeof this.accessories[name].services[service_name] === "undefined") {
      ack = false; message = "name '" + name + "', service_name '" + service_name + "' undefined.";
      this.log.debug("Controller.validate %s", message);
      return {isValid: ack, message: message, service_name: service_name, value: value};
    }
  }
  
  if(typeof(this.accessories[name]) === "undefined") {
    ack = false; message = "name '" + name + "' undefined.";
    
  } else if (typeof(Characteristic[c]) !== "function") {
    ack = false; message = "characteristic '" + c + "' undefined.";
    
  } else if (typeof(api_accessory.value) === "undefined" || api_accessory.value === null) {
    ack = false; message = "name '" + name + "' value undefined.";
    
  } else if (typeof this.accessories[name].services[service_name] == "undefined") {
    ack = false; message = "name '" + name + "', service_name '" + service_name + "' undefined.";
    
  } else if (typeof(this.accessories[name].services[service_name].getCharacteristic(Characteristic[c])) === "undefined") {
    message = "name '" + name + "' service_name '" + service_name + "' characteristic do not match.";
    
  } else {
    ack = true; message = "name '" + name + "' valid.";
  }
  
  return {isValid: ack, message: message, service_name: service_name, value: value};
}
