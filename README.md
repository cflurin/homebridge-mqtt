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
      "name": "mqtt"
      "uri": "mqtt://127.0.0.1"
    }
  ],           

  "accessories": []
}
```

Replace 127.0.0.1 with the ip-address of your mqtt broker.

### mqtt API

The data is sent/received in a JSON format using following topics:


* homebridge/to/add
* homebridge/to/remove
* homebridge/to/get
* homebridge/to/set
* homebridge/from/set
* homebridge/from/get
* homebridge/from/response


**Howto examples:**

**homebridge/to/add**

```sh
{"name": "flex_lamp", "service": "Switch"}
```

After the new accessory is added homebridge-mqtt sends an acknowledge message:

```sh
topic: homebridge/from/response
payload: {"ack": true, "message": "accessory 'flex_lamp' is added."}
```

**homebridge/to/remove**

```sh
{"name": "flex_lamp"}
```

After the accessory is removed homebridge sends an acknowledge message:

```sh
topic: homebridge/from/response
payload: {"ack": true, "message": "accessory 'flex_lamp' is removed."}
```

**homebridge/to/get)**

```sh
{"name": "*"}
```

homebridge sends an accessories list:

```sh
{
  "node_switch":{"service":"Switch","characteristics":{"On":true}},
  "office_lamp":{"service":"Lightbulb","characteristics":{"On":"blank","Brightness":65}},
  "at_home":{"service":"OccupancySensor","characteristics":{"OccupancyDetected":1}}
}
```

```sh
{"name": "outdoor_temp"}
```

homebridge sends the accessory JSON object:

```sh
{
  "outdoor_temp": {"service": "TemperatureSensor", "characteristics": {"CurrentTemperature": "13.4"}}
}
```

**homebridge/to/set**

```sh
{"name": "flex_lamp", "characteristic": "On", "value": true}
```

**homebridge/from/get**

```sh
{"name": "flex_lamp", "characteristic": "On"}
```

Homebridge-mqtt will return the cached value to HomeKit. Optionally you can publish the actual value using
`homebridge/to/set`.

**homebridge/from/set**

```sh
{"name": "flex_lamp", "characteristic": "On", "value": true}
```

The required characteristics are added with the default properties. If you need to change the default, define the characteristic-name with the properties. e.g.:

```sh
{
  "name": "temp_living",
  "service": "TemperatureSensor",
  "CurrentTemperature": {"minValue": -20, "maxValue": 60,"minStep": 1}
}
```

To add an optional charachteristic define the characteristic-name with "default" or with the properties. e.g.:

```sh
{"name": "living_lamp", "service": "Lightbulb", "Brightness": "default"}
```

```sh
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
