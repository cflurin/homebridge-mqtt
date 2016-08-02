# homebridge-mqtt
Homebridge-mqtt is a Plugin for Homebridge. The mqtt-API supports the main homebridge functions. This allows you to add and control accessories from a "Bridge" or "Gateway" with a mqtt API. [Node-RED](http://nodered.org/) is the perfect platform to use with homebridge-mqtt.

Note-RED is a visual tool for wiring together hardware devices, APIs and online services.

### Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).
If you are running on a Raspberry, you will find a tutorial in the [homebridge-punt Wiki](https://github.com/cflurin/homebridge-punt/wiki/Running-Homebridge-on-a-Raspberry-Pi).

Install homebridge:
```sh
sudo npm install -g homebridge
```
Install homebridge-mqtt:
```sh
sudo npm install -g homebridge-mqtt
```

### Configuration
Add the mqtt-platform in config.json in your home directory inside `.homebridge`.

```sh
{
  "bridge": {
    "name": "Homebridge",
    "username": "CC:22:3D:E3:CE:30",
    "port": 51826,
    "pin": "031-45-154"
  },
  
  "platforms": [
    {
      "platform": "mqtt",
      "name": "mqtt",
      "url": "mqtt://127.0.0.1"
    }
  ],           

  "accessories": []
}
```

Replace `127.0.0.1` with the ip-address of your mqtt broker.

### mqtt API

The data (payload) is sent/received in a JSON format using following topics:


* homebridge/to/add
* homebridge/to/remove
* homebridge/to/get
* homebridge/to/set
* homebridge/from/get
* homebridge/from/set
* homebridge/from/response


**Howto examples:**

**add accessory**

```sh
topic: homebridge/to/add
payload: {"name": "flex_lamp", "service": "Switch"}
```

After the new accessory is added homebridge-mqtt sends an acknowledge message:

```sh
topic: homebridge/from/response
payload: {"ack": true, "message": "accessory 'flex_lamp' is added."}
```

**remove accessory**

```sh
topic: homebridge/to/remove
payload: {"name": "flex_lamp"}
```

After the accessory is removed homebridge sends an acknowledge message:

```sh
topic: homebridge/from/response
payload: {"ack": true, "message": "accessory 'flex_lamp' is removed."}
```

**get accessoy/accessories**

```sh
topic: homebridge/to/get
payload: {"name": "outdoor_temp"}
```

homebridge sends the accessory definition:

```sh
topic: homebridge/from/response
payload:
  {
    "outdoor_temp": {"service": "TemperatureSensor", "characteristics": {"CurrentTemperature": "13.4"}}
  }
```

```sh
topic: homebridge/to/get
payload: {"name": "*"}
```

homebridge sends all accessory definitions:

```sh
topic: homebridge/from/response
payload:
  {
    "node_switch":{"service":"Switch","characteristics":{"On":true}},
    "office_lamp":{"service":"Lightbulb","characteristics":{"On":"blank","Brightness":65}},
    "at_home":{"service":"OccupancySensor","characteristics":{"OccupancyDetected":1}}
  }
```

**set value (from homebridge)**

```sh
topic: homebridge/to/set
payload: {"name": "flex_lamp", "characteristic": "On", "value": true}
```

**get value (to homebridge)**

```sh
topic: homebridge/from/get
payload: {"name": "flex_lamp", "characteristic": "On"}
```

Homebridge-mqtt will return the cached value to HomeKit. Optionally you can publish the actual value using
`homebridge/to/set`.

**set value (from homebridge)**

```sh
topic: homebridge/from/set
payload: {"name": "flex_lamp", "characteristic": "On", "value": true}
```

**define characterstic**

The required characteristics are added with the default properties. If you need to change the default, define the characteristic-name with the properties. e.g.:

```sh
topic: homebridge/to/add
payload:
  {
    "name": "living_temp",
    "service": "TemperatureSensor",
    "CurrentTemperature": {"minValue": -20, "maxValue": 60,"minStep": 1}
  }
```

To add an optional charachteristic define the characteristic-name with "default" or with the properties. e.g.:

```sh
topic: homebridge/to/add
payload: {"name": "living_lamp", "service": "Lightbulb", "Brightness": "default"}
```

```sh
topic: homebridge/to/add
payload:
  {
    "name": "bathroom_blind",
    "service": "WindowCovering",
    "CurrentPosition": {"minStep": 5},
    "TargetPosition": {"minStep": 5},
    "CurrentHorizontalTiltAngle": {"minValue": 0, "minStep": 5},
    "TargetHorizontalTiltAngle": {"minValue": 0, "minStep": 5}
  }

```

[HomeKitTypes.js](https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js) describes all the predifined Services and Characteristcs.
