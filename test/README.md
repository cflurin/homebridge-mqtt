# Homebridge-MQTT Test Suite

Automated testing for homebridge-mqtt Homebridge v2.0 compatibility.

## Prerequisites

- Node.js 18.20.4 or later
- Running Homebridge instance with homebridge-mqtt plugin installed
- MQTT broker running and accessible

## Installation

```bash
npm install
```

## Usage

### Run tests against local MQTT broker (no auth)
```bash
npm test
# or
npm run test:local
```

### Run tests with authentication - Command Line
```bash
# Format: node homebridge-mqtt-test.js [broker_url] [username] [password]
node homebridge-mqtt-test.js mqtt://192.168.1.100:1883 myuser mypassword
```

### Run tests with authentication - Environment Variables (Recommended)
```bash
# Set environment variables
export MQTT_BROKER=mqtt://192.168.1.100:1883
export MQTT_USER=myuser
export MQTT_PASS=mypassword

# Run tests
npm run test:env
# or just
node homebridge-mqtt-test.js
```

### Run tests with custom topic prefix
```bash
export TOPIC_PREFIX=homebridge
node homebridge-mqtt-test.js
```

### Enable debug mode for verbose output
```bash
# Shows all MQTT messages and internal processing
DEBUG=true node homebridge-mqtt-test.js

# Or with authentication
DEBUG=true MQTT_USER=admin MQTT_PASS=secret node homebridge-mqtt-test.js mqtt://192.168.1.100:1883
```

### Using .env file (requires dotenv)
Create a `.env` file:
```env
MQTT_BROKER=mqtt://192.168.1.100:1883
MQTT_USER=myuser
MQTT_PASS=mypassword
TOPIC_PREFIX=homebridge
```

Then run:
```bash
# Install dotenv if needed
npm install dotenv

# Load .env and run
node -r dotenv/config homebridge-mqtt-test.js
```

### Quick Examples
```bash
# Local broker, no auth
node homebridge-mqtt-test.js

# Remote broker with auth (command line)
node homebridge-mqtt-test.js mqtt://192.168.1.100:1883 admin secret123

# Remote broker with auth (environment variables - more secure)
MQTT_BROKER=mqtt://192.168.1.100:1883 MQTT_USER=admin MQTT_PASS=secret123 node homebridge-mqtt-test.js

# TLS/SSL connection
MQTT_BROKER=mqtts://192.168.1.100:8883 MQTT_USER=admin MQTT_PASS=secret123 node homebridge-mqtt-test.js
```

## What It Tests

### Core Functionality
1. **Add Simple Accessory** - Creates a Switch with manufacturer information
2. **Set Characteristic Value** - Tests setting characteristic values (On/Off)
3. **Multiple Services** - Tests accessories with multiple services (Temperature + Humidity sensors)
4. **Get All Accessories** - Retrieves and validates all accessories

### Homebridge v2.0 Specific Tests
5. **Reachability WITH StatusActive** - Tests accessories that support StatusActive characteristic (e.g., Switch)
   - Verifies the v2.0 workaround updates StatusActive when available
6. **Reachability WITHOUT StatusActive** - Tests accessories that don't support StatusActive (e.g., Lightbulb)
   - Verifies graceful handling without errors or warnings

### Advanced Features
7. **Optional Characteristics** - Tests Lightbulb with Brightness, Hue, Saturation
8. **Custom Properties** - Tests TemperatureSensor with custom min/max/step values
9. **Remove Service** - Tests removing a service from a multi-service accessory
10. **Cleanup** - Removes all test accessories

## Understanding the Output

### Color Coding
- 🟢 **Green** - Passed tests and successful operations
- 🔴 **Red** - Failed tests and errors
- 🔵 **Blue** - Informational messages
- 🟡 **Yellow** - Warnings and status updates
- 🔵 **Cyan** - Test section headers

### Example Output
```
╔═══════════════════════════════════════════════════════════╗
║   Homebridge-MQTT Automated Test Suite (v2.0 Compat)    ║
╚═══════════════════════════════════════════════════════════╝

✓ Connected to MQTT broker
✓ Subscribed to homebridge/from/#

▶ Testing: Add Accessory (Switch)
  ℹ Publishing to homebridge/to/add: {...}
  ✓ Accessory 'test_switch_1697123456_789' added successfully

▶ Testing: Set Reachability - Service WITH StatusActive (e.g. Switch)
  ✓ Set 'test_switch_1697123456_789' to unreachable
  ℹ Service supports StatusActive - should update characteristic
  ✓ Set 'test_switch_1697123456_789' back to reachable

▶ Testing: Set Reachability - Service WITHOUT StatusActive (e.g. Lightbulb)
  ✓ Lightbulb 'test_lightbulb_1697123457_456' added
  ✓ Set 'test_lightbulb_1697123457_456' to unreachable (gracefully handled without StatusActive)
  ℹ Service does NOT support StatusActive - should log and continue without error
  ✓ Set 'test_lightbulb_1697123457_456' back to reachable

============================================================
Test Summary
============================================================
Total Passed: 15
Total Failed: 0

🎉 All tests passed! Plugin is Homebridge v2.0 compatible!
```

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed or error occurred

## Troubleshooting

### Enable Debug Mode First!
If you're experiencing issues, run with debug mode to see all MQTT traffic:
```bash
DEBUG=true node homebridge-mqtt-test.js mqtt://your-broker:1883 user pass
```

This will show:
- All published messages
- All received messages
- Callback matching logic
- Active callback registrations

### "Timeout waiting for response"
This is the most common issue. Here's how to diagnose:

1. **Run with DEBUG=true** to see if responses are being received
2. **Check the response format** - look for the accessory name in the response
3. **Verify topic_type** in your homebridge-mqtt config:
   - If `topic_type: "single"`, responses go to `homebridge/from/response/accessory_name`
   - If `topic_type: "multiple"` (default), responses go to `homebridge/from/response`
4. **Check Homebridge logs** - is the plugin processing the requests?
5. **Increase timeout** if your system is slow:
   ```bash
   # Temporarily edit the script to increase RESPONSE_TIMEOUT from 5000 to 10000
   ```

### Topic Type Mismatch
If you're using `topic_type: "single"` in your homebridge-mqtt config, the test script may need modification. Check your config.json:
```json
{
  "platform": "mqtt",
  "topic_type": "single"  // or "multiple"
}
```

### "Timeout waiting for response"
- Ensure Homebridge is running and the homebridge-mqtt plugin is loaded
- Check MQTT broker connectivity
- Verify topic prefix matches your configuration (default: `homebridge`)

### "MQTT Error: Connection refused"
- Verify MQTT broker is running
- Check the broker URL and port
- Ensure firewall allows connection

### "MQTT Error: Not authorized" or "MQTT Error: Bad username or password"
- Verify your MQTT credentials are correct
- Check that the MQTT user has appropriate permissions (subscribe and publish to homebridge/# topics)
- Ensure username/password are being passed correctly (check the connection log output)

### Tests fail on "Set Reachability"
- This is a critical v2.0 compatibility test
- Check Homebridge logs for errors related to StatusActive
- Verify the updateReachability implementation in controller.js

### Connection issues with TLS/SSL (mqtts://)
- Ensure your MQTT broker has valid certificates
- You may need to configure additional TLS options in the script

## What to Look For in Homebridge Logs

When running tests, monitor your Homebridge logs for:

### ✅ Good Signs (v2.0 Compatible)
```
[mqtt] updateReachability test_switch_123 set reachable=false
[mqtt] [HB2] test_lightbulb_456: no service exposes StatusActive; stored reachable=false
```

### ❌ Bad Signs (Not v2.0 Compatible)
```
Error: updateReachability is not a function
TypeError: Cannot read property 'StatusActive' of undefined
```

## CI/CD Integration

The test suite returns proper exit codes and can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run homebridge-mqtt tests
  run: |
    npm install
    npm test
```

## Customization

You can modify test parameters in the script:
- `TOPIC_PREFIX` - Default MQTT topic prefix (default: 'homebridge')
- `TEST_TIMEOUT` - Maximum time per test (default: 5000ms)
- `RESPONSE_TIMEOUT` - Time to wait for MQTT response (default: 2000ms)

## License

MIT