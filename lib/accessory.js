'use strict';

var Utils = require('./utils.js').Utils;
var Service, Characteristic, Mqtt;

Number.prototype.pad = function (len) {
    return (new Array(len+1).join("0") + this).slice(-len);
}

module.exports = {
  Accessory: Accessory
}

function Accessory(params) {
     
  this.accessoryDef = params.accessoryDef;
  this.log = params.log;
  Service = params.Service;
  Characteristic = params.Characteristic;
  Mqtt = params.Mqtt;

  this.name = this.accessoryDef.name;
  this.service_name = {};
  
  this.hap_accessory;  // todo
  
  this.i_value = {}; 
  this.i_label = {};
  this.i_props = {};
  this.reachable = true;
  
  this.services = {};
  this.subtypes = [];
  
  this.set_timeout;
  this.prec_c;
}

//
// configuration
//

Accessory.prototype.addService = function(accessory, service_name, subtype) {

  var isValid;

  if (typeof Service[service_name] !== "undefined") {
    if (typeof subtype === "undefined") { // primary service
      var subtype = "primary";
      accessory.addService(Service[service_name], this.name, subtype);
      accessory.context.service_name = service_name;
      
    } else { // multi service
      if (typeof accessory.context.multi_services === "undefined") {
        accessory.context.multi_services = {};
      }
      accessory.context.multi_services[subtype] = service_name;
      //this.log.debug("Accessory.addService %s", JSON.stringify(this.subtypes));
      
      accessory.addService(Service[service_name], subtype, subtype);
    }
    this.service_name[subtype] = service_name;
    isValid = true;
  } else {
    isValid = false;
  }
  
  return isValid;
}

Accessory.prototype.configureAccessory = function(accessory, service_name, subtype) {
    
  if (typeof service_name !== "undefined") {
    if (typeof subtype === "undefined") {
      subtype = "primary";
      this.services[subtype] = accessory.getService(this.name);
      this.addSubtype(subtype);
      //this.log.debug("Accessory.configureAccessory \n%s", JSON.stringify(this.services[subtype], null, 2));
      this.configureCharacteristics(accessory, subtype);
    } else {
      this.services[subtype] = accessory.getServiceByUUIDAndSubType(subtype, subtype);
      this.addSubtype(subtype);
      this.configureCharacteristics(accessory, subtype);
    }
  } else { // cachedAccessories
    subtype = "primary";
    this.services[subtype] = accessory.getService(this.name);
    this.addSubtype(subtype);
    this.service_name[subtype] = accessory.context.service_name;
    
    this.log.debug("Accessory.configureAccessory %s %s", this.name, subtype);
    //this.log.debug("Accessory.configureAccessory \n%s", JSON.stringify(this.services.primary));  

    this.configureCharacteristics(accessory, subtype);
    
    for (var k in accessory.services) {
      if (typeof accessory.services[k].subtype !== "undefined" && accessory.services[k].subtype !== "primary") {
        subtype = accessory.services[k].subtype;
        this.services[subtype] = accessory.getServiceByUUIDAndSubType(subtype, subtype);
        // *alternativ*    this.services[k] = accessory.services[k];
        this.addSubtype(subtype);
        this.log.debug("Accessory.configureAccessory %s", this.services[subtype].subtype);
        this.configureCharacteristics(accessory, subtype);
      }
    }
    for (var k in accessory.context.multi_services) {
      this.service_name[k] = accessory.context.multi_services[k];
    }
     
  }
  //this.log.debug("Accessory.configureAccessory i_value %s", JSON.stringify(this.i_value));
  this.hap_accessory = accessory;
}

Accessory.prototype.addSubtype = function(subtype) {
  this.i_value[subtype] = {};
  this.i_props[subtype] = {};
  this.i_label[subtype] = {};
  this.subtypes.push(subtype);
}

Accessory.prototype.configureCharacteristics = function(accessory, subtype) {

  var c;
  var service = this.services[subtype];
  
  for (var k in service.characteristics) {
  
    c = service.characteristics[k].displayName.replace(/\s/g, "");
    //this.log.debug("Accessory.configureAccessory %s %s %s", this.name, service_name, c);
    
    if (c != "Name") {
      this.allocate(service, c);
      this.setProps(service, c);
      this.i_value[subtype][c] = "blank";
      this.i_props[subtype][c] = JSON.parse(JSON.stringify(service.getCharacteristic(Characteristic[c]).props));
      //this.log.debug("Accessory.configureAccessory %s %s %s %s", this.name, service_name, c, JSON.stringify(this.i_props));
    }
  }
  //this.log.debug("Accessory.configureAccessory Def %s", JSON.stringify(this.accessoryDef[c]));
    
  // note: if the accessories are restored from cachedAccessories, the optionalCharacteristics are stored in characteristics.
  for (var k in service.optionalCharacteristics) {
    
    c = service.optionalCharacteristics[k].displayName.replace(/\s/g, "");
    
    if (typeof(this.accessoryDef[c]) !== "undefined") {
      this.log.debug("Accessory.configureAccessory %s %s optional %s", this.name, service_name, c);
      
      if (c != "Name") {
        this.allocate(service, c);
        this.setProps(service, c);
        this.i_value[subtype][c] = "blank";
        this.i_props[subtype][c] = JSON.parse(JSON.stringify(service.getCharacteristic(Characteristic[c]).props));
      }
    }
  }
}

Accessory.prototype.allocate = function(service, c) {

  var self = this;
  var sc = service.getCharacteristic(Characteristic[c]);
  
  sc.on('get', function(callback, context) {self.get(callback, context, this.displayName, this.iid)});
  if (sc.props.perms.indexOf("pw") > -1) { 
    //this.log.debug("Accessory.allocate 'set' event %s %s", this.name, c);
    sc.on('set', function(value, callback, context) {self.set(value, callback, context, this.displayName, this.iid)});
  }
}

Accessory.prototype.setProps = function(service, c) {

  // only for newAccessories
  if (typeof(this.accessoryDef[c]) !== "undefined") {
    if (this.accessoryDef[c] != "default") {
      service.getCharacteristic(Characteristic[c]).setProps(this.accessoryDef[c]);
    }
    //this.log.debug("Accessory.setProps %s %s %s", this.name, c, this.accessoryDef[c]);
  }
}

Accessory.prototype.configureIdentity = function(accessory) {

  accessory.on('identify', function(paired, callback) {this.identify(paired, callback)}.bind(this));
}

//
// from HomeKit functions
//

Accessory.prototype.get = function(callback, context, displayName, iid) {
   
  if (this.reachable) {
  
    var subtype = this.getSubtype(iid);
    //this.log.debug("Accessory.get iid %s subtype %s", iid, subtype);
    
    if (typeof subtype === "undefined") {
      subtype = "primary";
    }

    var c = displayName.replace(/\s/g, "");
    this.log.debug("Accessory.get %s %s", subtype, c);
    
    
    Mqtt.get(this.name, subtype, c, callback);
    var value;
    
    if (typeof(this.i_value[subtype][c]) !== "undefined" && this.i_value[subtype][c] !== "blank") {
      value = this.i_value[subtype][c];
    } else {
      value = null;
    }
    //this.log.debug("Accessory.get %s %s %s", this.name, c, value);
    callback(null, value);
  } else {
    callback("no_response");
  }
}

Accessory.prototype.set = function(value, callback, context, displayName, iid) {

  if (this.reachable) {
  
    var subtype = this.getSubtype(iid);
    
    if (typeof subtype === "undefined") {
      subtype = "primary";
    }
    
    var c = displayName.replace(/\s/g, "");
    //this.log.debug("Accessory.set %s %s %s %s", this.name, c, value, JSON.stringify(context));
    this.log.debug("Accessory.set %s %s %s %s", iid, subtype, c, value);
    
    if (c == "On") value = (value == 0 || value == false) ? false : true;
    this.i_value[subtype][c] = value;
    
    if (typeof(context) !== "undefined" && typeof(context.trigger) === "undefined") {
      this.setLabel("homekit", subtype, c);
    }

    if (typeof(context) !== "undefined" && typeof(context.trigger) !== "undefined" && context.trigger.match(/Mqtt/g)) {
      //this.log.debug("Accessory.set %s %s %s - Mqtt", this.name, c, value);
      callback();
    } else {
      switch (c) {
        case "Brightness":
        case "TargetPosition":
        case "TargetHorizontalTiltAngle":
        case "TargetVerticalTiltAngle":
        case "TargetRelativeHumidity":
        case "TargetTemperature":
          if (this.set_timeout && c === this.pre_c) {
            clearTimeout(this.set_timeout);
          }
          this.set_timeout = setTimeout(function() {
            Mqtt.set(this.name, c, value, callback);
          }.bind(this), 250);
          this.pre_c = c;
          break;
          
        default:
          Mqtt.set(this.name, subtype, c, value, callback);
      }
    }
  } else {
    callback("no_response");
  }
}

Accessory.prototype.getSubtype = function(iid) {

  var subtype;

  for (var k in this.hap_accessory.services) {
    //this.log.debug("Accessory.get service %s", this.hap_accessory.services[k].iid);
    for (var i in this.hap_accessory.services[k].characteristics) {
      //this.log.debug("Accessory.get characteristic %s", this.hap_accessory.services[k].characteristics[i].iid);
      if (iid === this.hap_accessory.services[k].characteristics[i].iid) {
        //this.log.debug("Accessory.get %s", this.hap_accessory.services[k].subtype);
        subtype = this.hap_accessory.services[k].subtype;
        break;
      }
    }
  }
  return subtype;
}

Accessory.prototype.identify = function (paired, callback) {

  this.log("Accessory.identify %s", this.name);
  // todo
  callback();
}

//
// to HomeKit and value-handling functions
//

Accessory.prototype.save_and_setValue = function (trigger, subtype, c, value) {

  //this.log.debug("Accessory.save_and_setValue %s %s %s", trigger, c, value);
  
  if (typeof subtype === "undefined") {
    subtype = "primary";
  }
  var result = {};
  
  result = this.parseValue(subtype, c, value);

  if (result.isValid) {
    this.i_value[subtype][c] = result.value;
    this.setLabel(trigger, subtype, c);
  
    var context = this.i_label[c];
    //context is also used by the hap-server ('get' and 'set' event) - "context": {"keepalive":true, ...
    //this.log.debug("Accessory.save_and_setValue %s %s %s %s %s ", trigger, this.name, c, result.value, JSON.stringify(context));

    if (typeof(context) !== "undefined") {
      this.services[subtype].getCharacteristic(Characteristic[c]).setValue(result.value, null, context);
    }
    else {
      this.services[subtype].getCharacteristic(Characteristic[c]).setValue(result.value);
    }
  }
}

Accessory.prototype.parseValue = function(subtype, c, value) {

  var isValid = true;
  if (typeof subtype === "undefined") {
    subtype = "primary";
  }
  var sc = this.services[subtype].getCharacteristic(Characteristic[c]);
  //this.log.debug("Accessory.parseValue %s %s", c, JSON.stringify(sc));
   
  switch (sc.props.format) {
    case "bool":
      value = (value == 0 || value == false) ? false : true;
      break;
      
    case "int":
    case "uint8":
    case "uint16":
    case "unit32":
      value = parseInt(value);
      if (value < sc.props.minValue || value > sc.props.maxalue) {
        this.log.error("Accessory.parse %s %s value '%s' outside range.", this.name, c, value);
        isValid = false;
      }
      break;
      
    case "float":
      value = parseFloat(value);
      if (value < sc.props.minValue || value > sc.props.maxalue) {
        this.log.error("Accessory.parse %s %s value '%s' outside range.", this.name, c, value);
        isValid = false
      }
      break;
      
    default:
      // string, tlv8, 
      value = undefined;
      this.log.warn("Accessory.parseValue %s %s %s %s", name, c, value, JSON.stringify(sc.props));
  }
  return {isValid: isValid, value: value};
}

Accessory.prototype.setLabel = function(trigger, subtype, c) {

  var now = new Date();
  var timestamp = now.getHours().pad(2)+":"+now.getMinutes().pad(2)+":"+now.getSeconds().pad(2);
   // +","+now.getMilliseconds(); 
  
  this.i_label[subtype][c] = {
    "timestamp": timestamp,
    "trigger": trigger
  };
}
