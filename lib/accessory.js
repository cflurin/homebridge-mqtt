'use strict';

var Utils = require('./utils.js').Utils;

var Service, Characteristic, platform_name, get, set, identify;

Number.prototype.pad = function (len) {
    return (new Array(len+1).join("0") + this).slice(-len);
}

module.exports = {
  Accessory: Accessory
}

function Accessory(params) {
     
  this.log = params.log;
  Service = params.Service;
  Characteristic = params.Characteristic;
  platform_name = params.platform_name;
  get = params.get;
  set = params.set;
  identify = params.identify;
   
  this.name;          // assigned by this.configureAccessory

  this.i_value = {}; 
  this.i_label = {};
  this.i_props = {};
  
  this.reachable = true;
  
  this.services = {};
  this.service_types = {};
  this.service_names = {};
  this.service_namesList = [];
  
  this.set_timeout;
  this.prec_c;
}

//
// configuration
//

Accessory.prototype.addService = function(accessory, service_name, service_type) {

  accessory.addService(Service[service_type], service_name, service_name);
  
  this.service_types[service_name] = service_type;
  
  if (typeof accessory.context.service_types === "undefined") {
    accessory.context.service_types = {};
  }
  accessory.context.service_types[service_name] = service_type;
}

Accessory.prototype.removeService = function(service_name) {

  this.log.debug("Accessory.removeService %s %s", this.name, service_name);
    
  delete this.services[service_name];
  delete this.service_types[service_name];
  delete this.service_names[service_name];
  
  delete this.i_value[service_name];
  delete this.i_props[service_name];
  delete this.i_label[service_name];
  this.service_namesList.pop(service_name);
}

Accessory.prototype.addService_name = function(service_name) {

  this.i_value[service_name] = {};
  this.i_props[service_name] = {};
  this.i_label[service_name] = {};
  this.service_namesList.push(service_name);
}

Accessory.prototype.configureAccessory = function(accessory, api_accessory, service_name, service_type) {

  if (typeof api_accessory !== "undefined") {  // new accessory
    this.name = api_accessory.name;
    
    this.log.debug("Accessory.configureAccessory '%s' '%s' '%s'", this.name, service_name, service_type);
    
    this.services[service_name] = accessory.getServiceByUUIDAndSubType(service_name, service_name);
    //this.services[service_name] = accessory.getService(service_name);
    
    this.addService_name(service_name);
    this.configureCharacteristics(accessory, api_accessory, service_name);
    this.configureOptionalCharacteristics(accessory, api_accessory, service_name);
        
  } else { // cachedAccessories
    this.name = accessory.displayName;
    
    for (var k in accessory.services) {
      if (typeof accessory.services[k].displayName !== "undefined") {
        service_name = accessory.services[k].displayName;
        
        this.services[service_name] = accessory.getServiceByUUIDAndSubType(service_name, service_name);
        
        // backwards compatible
        if (typeof this.services[service_name] === "undefined" ) {
          this.services[service_name] = accessory.getService(service_name);
          this.log.debug("Accessory.configureAccessory [v0.2.4] '%s' '%s'", this.name, this.services[service_name].displayName);
        } else {
          this.log.debug("Accessory.configureAccessory '%s' '%s'", this.name, service_name);
        }
        
        this.addService_name(service_name);
        this.configureCharacteristics(accessory, api_accessory, service_name);
        //this.log.debug("Accessory.configureAccessory %s", JSON.stringify(this.services[service_name], null, 2));
      }
    }
    
    if (typeof accessory.context.service_types !== "undefined") {
      for (var k in accessory.context.service_types) {
        this.service_types[k] = accessory.context.service_types[k];
      }
    } else {
      // backwards compatible
      if (typeof accessory.context.service_name !== "undefined") {
        this.service_types[this.name] = accessory.context.service_name;
      }
    }
  }
  //this.log.debug("Accessory.configureAccessory %s", JSON.stringify(accessory, null, 2));
}

Accessory.prototype.configureCharacteristics = function(accessory, api_accessory, service_name) {

  var c,v;
  var service = this.services[service_name];
  
  for (var k in service.characteristics) {
  
    c = service.characteristics[k].displayName.replace(/\s/g, "");
    v = service.characteristics[k].value;
    this.log.debug("Accessory.configureCharacteristics %s %s %s %s", this.name, service_name, c, v);
    
    if (c != "Name") {
      this.allocate(service, c);
      if (typeof api_accessory !== "undefined") {
        this.setProps(service, c, api_accessory);
      }
      this.i_value[service_name][c] = v;
      this.i_props[service_name][c] = JSON.parse(JSON.stringify(service.getCharacteristic(Characteristic[c]).props));
      //this.log.debug("Accessory.configureCharacteristics %s %s %s %s", this.name, service_name, c, JSON.stringify(this.i_props));
    }
  }
  //this.log.debug("Accessory.configureCharacteristics %s", JSON.stringify(api_accessory[c]));
}

Accessory.prototype.configureOptionalCharacteristics = function(accessory, api_accessory, service_name) {

  var c;
  var service = this.services[service_name];
    
  // note: if the accessories are restored from cachedAccessories, the optionalCharacteristics are stored in characteristics.
  for (var k in service.optionalCharacteristics) {
    
    c = service.optionalCharacteristics[k].displayName.replace(/\s/g, "");
    
    if (typeof(api_accessory[c]) !== "undefined") {
      this.log.debug("Accessory.configureCharacteristics %s %s optional %s", this.name, service_name, c);
      
      if (c != "Name") {
        this.allocate(service, c);
        this.setProps(service, c, api_accessory);
        this.i_value[service_name][c] = "blank";
        this.i_props[service_name][c] = JSON.parse(JSON.stringify(service.getCharacteristic(Characteristic[c]).props));
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

Accessory.prototype.setProps = function(service, c, api_accessory) {

  // only for newAccessories
  if (typeof(api_accessory[c]) !== "undefined") {
    if (api_accessory[c] != "default") {
      service.getCharacteristic(Characteristic[c]).setProps(api_accessory[c]);
    }
    //this.log.debug("Accessory.setProps %s %s %s", this.name, c, api_accessory[c]);
  }
}

Accessory.prototype.getService_names = function() {
 
  var service_name;
  
  this.log.debug("Accessory.getService_names");
  for (var k in this.services) {
    for (var i in this.services[k].characteristics) {
      if (this.services[k].characteristics[i].displayName !== "Name") {
        this.service_names[this.services[k].characteristics[i].iid] = this.services[k].displayName;
        this.log.debug("Accessory.getService_names [iid %s] %s '%s' '%s'", this.services[k].characteristics[i].iid, this.name, this.services[k].characteristics[i].displayName, this.services[k].displayName);
      }
    }
  }
  //this.log.debug("Accessory.getService_names \n%s", JSON.stringify(this.service_names));
}

Accessory.prototype.configureIdentity = function(accessory) {

  accessory.on('identify', function(paired, callback) {this.identify(paired, callback)}.bind(this));
}

//
// from HomeKit functions
//

Accessory.prototype.get = function(callback, context, displayName, iid) {
   
  if (this.reachable) {
    var c = displayName.replace(/\s/g, "");
    //this.log.debug("Accessory.get %s '%s' '%s'", this.name, iid, c);
    
    if (typeof this.service_names[iid] === "undefined") {
      this.getService_names();
    }
    var service_name = this.service_names[iid];
    
    this.log.debug("Accessory.get [iid %s] '%s' '%s' '%s'", iid, this.name, service_name, c);
    get(this.name, service_name, c, callback);
    
    var value;
    if (typeof(this.i_value[service_name][c]) !== "undefined" && this.i_value[service_name][c] !== "blank") {
      value = this.i_value[service_name][c];
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
    var c = displayName.replace(/\s/g, "");
    //this.log.debug("Accessory.set %s '%s' '%s' %s", this.name, iid, c, value);  
    
    if (typeof this.service_names[iid] === "undefined") {
      this.getService_names();
    }
    var service_name = this.service_names[iid];
        
    if (c == "On") value = (value == 0 || value == false) ? false : true;
    this.i_value[service_name][c] = value;
    
    if (typeof(context) !== "undefined" && typeof(context.trigger) === "undefined") {
      this.setLabel("homekit", service_name, c);
    }

    if (typeof(context) !== "undefined" && typeof(context.trigger) !== "undefined" && context.trigger.includes(platform_name)) {
      callback();
    } else {
      this.log.debug("Accessory.set [iid %s] '%s' '%s' '%s' %s", iid, this.name, service_name, c, value);
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
            set(this.name, service_name, c, value, callback);
          }.bind(this), 250);
          this.pre_c = c;
          break;
          
        default:
          set(this.name, service_name, c, value, callback);
      }
    }
  } else {
    callback("no_response");
  }
}

Accessory.prototype.identify = function (paired, callback) {
 
  identify(this.name);
  callback();
}

//
// to HomeKit and value-handling functions
//

Accessory.prototype.save_and_setValue = function (trigger, service_name, c, value) {
  
  var result = {};
  
  result = this.parseValue(service_name, c, value);

  if (result.isValid) {
    //this.log.debug("Accessory.save_and_setValue '%s' '%s' '%s' %s", this.name, service_name, c, value);
    this.i_value[service_name][c] = result.value;
    this.setLabel(trigger, service_name, c);
  
    var context = this.i_label[service_name][c];
    //context is also used by the hap-server ('get' and 'set' event) - "context": {"keepalive":true, ...
    //this.log.debug("Accessory.save_and_setValue %s %s %s %s %s ", trigger, this.name, c, result.value, JSON.stringify(context));

    // todo: to clarify
    // A function to only updating the remote value, but not firiring the 'set' event.
    // Service.prototype.updateCharacteristic = function(name, value)
    
    if (typeof(context) !== "undefined") {
      this.services[service_name].getCharacteristic(Characteristic[c]).setValue(result.value, null, context);
    }
    else {
      this.services[service_name].getCharacteristic(Characteristic[c]).setValue(result.value);
    }
  }
  
  return result;
}

Accessory.prototype.parseValue = function(service_name, c, value) {

  var isValid = true;
  
  //this.log.debug("Accessory.parseValue %s %s", service_name, c);
  
  var sc = this.services[service_name].getCharacteristic(Characteristic[c]);
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
        this.log.debug("Accessory.parseInt %s %s value '%s' outside range.", this.name, c, value);
        isValid = false;
      }
      break;
      
    case "float":
      value = parseFloat(value);
      if (value < sc.props.minValue || value > sc.props.maxalue) {
        this.log.debug("Accessory.parseFloat %s %s value '%s' outside range.", this.name, c, value);
        isValid = false;
      }
      break;
      
    case "string":
      break;
      
    default:
      value = undefined;
      this.log.warn("Accessory.parseValue %s %s %s %s", name, c, value, JSON.stringify(sc.props));
  }
  return {isValid: isValid, value: value};
}

Accessory.prototype.setLabel = function(trigger, service_name, c) {

  var now = new Date();
  var timestamp = now.getHours().pad(2)+":"+now.getMinutes().pad(2)+":"+now.getSeconds().pad(2);
   // +","+now.getMilliseconds(); 
  
  this.i_label[service_name][c] = {
    "timestamp": timestamp,
    "trigger": trigger
  };
}
