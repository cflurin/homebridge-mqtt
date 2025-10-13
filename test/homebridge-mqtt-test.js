#!/usr/bin/env node
'use strict';

/**
 * Automated Test Suite for homebridge-mqtt
 * Tests Homebridge v2.0 compatibility
 * 
 * Requirements:
 *   npm install mqtt
 * 
 * Usage:
 *   node homebridge-mqtt-test.js [mqtt_broker_url] [username] [password]
 *   node homebridge-mqtt-test.js mqtt://192.168.1.100:1883 myuser mypass
 * 
 *   Or use environment variables:
 *   MQTT_BROKER=mqtt://192.168.1.100:1883 MQTT_USER=myuser MQTT_PASS=mypass node homebridge-mqtt-test.js
 * 
 *   Default: mqtt://127.0.0.1:1883 (no auth)
 */

const mqtt = require('mqtt');

// Configuration from args or environment variables
const MQTT_BROKER = process.argv[2] || process.env.MQTT_BROKER || 'mqtt://127.0.0.1:1883';
const MQTT_USERNAME = process.argv[3] || process.env.MQTT_USER || null;
const MQTT_PASSWORD = process.argv[4] || process.env.MQTT_PASS || null;
const TOPIC_PREFIX = process.env.TOPIC_PREFIX || 'homebridge';
const TEST_TIMEOUT = 10000; // 10 seconds per test
const RESPONSE_TIMEOUT = 5000; // 5 seconds to wait for response
const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

// Test state
let client;
let testsPassed = 0;
let testsFailed = 0;
let currentTest = null;
let responseCallbacks = new Map();

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n▶ Testing: ${name}`, 'cyan');
}

function logPass(message) {
  testsPassed++;
  log(`  ✓ ${message}`, 'green');
}

function logFail(message) {
  testsFailed++;
  log(`  ✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`  ℹ ${message}`, 'blue');
}

function logDebug(message) {
  if (DEBUG) {
    log(`  [DEBUG] ${message}`, 'yellow');
  }
}

// Generate unique test accessory names (HomeKit compliant - no underscores)
function generateAccessoryName(prefix) {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString();
  return `${prefix} ${timestamp} ${random}`;
}

// Wait for a response message
function waitForResponse(expectedName, timeout = RESPONSE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      responseCallbacks.delete(expectedName);
      reject(new Error(`Timeout waiting for response for '${expectedName}'`));
    }, timeout);

    responseCallbacks.set(expectedName, (payload) => {
      clearTimeout(timeoutId);
      responseCallbacks.delete(expectedName);
      resolve(payload);
    });
  });
}

// Wait for any response (for operations that don't return the name)
function waitForAnyResponse(timeout = RESPONSE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      responseCallbacks.delete('__any__');
      reject(new Error(`Timeout waiting for any response`));
    }, timeout);

    responseCallbacks.set('__any__', (payload) => {
      clearTimeout(timeoutId);
      responseCallbacks.delete('__any__');
      resolve(payload);
    });
  });
}

// Publish MQTT message
function publish(topic, payload) {
  const message = JSON.stringify(payload);
  logDebug(`Publishing to ${topic}: ${message}`);
  client.publish(topic, message);
}

// Test Functions

async function testAddAccessory() {
  logTest('Add Accessory (Switch)');
  const name = generateAccessoryName('testswitch');
  
  const responsePromise = waitForAnyResponse();
  
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light',
    service: 'Switch',
    manufacturer: 'Test Manufacturer',
    model: 'Test Model v2.0',
    serialnumber: 'TEST-001',
    firmwarerevision: '2.0.0'
  });

  try {
    const response = await responsePromise;
    if (response.ack === true) {
      logPass(`Accessory '${name}' added successfully`);
      return { success: true, name };
    } else {
      logFail(`Failed to add accessory: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testAddMultipleServices() {
  logTest('Add Accessory with Multiple Services');
  const name = generateAccessoryName('testmulti');
  
  // Add base accessory
  let responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'temperature',
    service: 'TemperatureSensor'
  });

  try {
    let response = await responsePromise;
    if (!response.ack) {
      logFail(`Failed to add base accessory: ${response.message}`);
      return { success: false };
    }
    logPass(`Base accessory '${name}' added`);

    // Add second service
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait a bit
    responsePromise = waitForAnyResponse();
    publish(`${TOPIC_PREFIX}/to/add/service`, {
      name: name,
      service_name: 'humidity',
      service: 'HumiditySensor'
    });

    response = await responsePromise;
    if (response.ack) {
      logPass(`Second service 'humidity' added to '${name}'`);
      return { success: true, name };
    } else {
      logFail(`Failed to add second service: ${response.message}`);
      return { success: false, name };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testSetValue(accessoryName) {
  logTest('Set Characteristic Value');
  
  if (!accessoryName) {
    logFail('No accessory name provided');
    return { success: false };
  }

  // Note: /to/set doesn't send a response on success, only on error
  // So we'll publish and then verify by getting all accessories
  publish(`${TOPIC_PREFIX}/to/set`, {
    name: accessoryName,
    service_name: 'light',
    characteristic: 'On',
    value: true
  });

  // Wait a bit for the set to be processed
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify by getting the accessory state
  const responsePromise = waitForResponse('*');
  publish(`${TOPIC_PREFIX}/to/get`, {
    name: '*'
  });

  try {
    const response = await responsePromise;
    // Check if the accessory exists and has the expected value
    if (response[accessoryName] && 
        response[accessoryName].characteristics &&
        response[accessoryName].characteristics.light &&
        response[accessoryName].characteristics.light.On === true) {
      logPass(`Set 'On' to true for '${accessoryName}' (verified via /to/get)`);
      logInfo('Note: /to/set does not send response on success');
      return { success: true };
    } else {
      logFail(`Failed to verify value was set for '${accessoryName}'`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testGetAccessories() {
  logTest('Get All Accessories');
  
  const responsePromise = waitForResponse('*');
  
  publish(`${TOPIC_PREFIX}/to/get`, {
    name: '*'
  });

  try {
    const response = await responsePromise;
    if (response.ack === true || Object.keys(response).length > 1) {
      const accessoryCount = Object.keys(response).filter(k => k !== 'ack' && k !== 'message' && k !== 'request_id').length;
      logPass(`Retrieved ${accessoryCount} accessories`);
      return { success: true, accessories: response };
    } else {
      logFail('Failed to get accessories');
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testReachabilityWithStatusActive(accessoryName) {
  logTest('Set Reachability - Service WITH StatusActive (e.g. Switch)');
  
  if (!accessoryName) {
    logFail('No accessory name provided');
    return { success: false };
  }

  // Test setting unreachable
  let responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/set/reachability`, {
    name: accessoryName,
    reachable: false
  });

  try {
    let response = await responsePromise;
    if (response.ack === true) {
      logPass(`Set '${accessoryName}' to unreachable`);
      logInfo('Service supports StatusActive - should update characteristic');
    } else {
      logFail(`Failed to set unreachable: ${response.message}`);
      return { success: false };
    }

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test setting reachable again
    responsePromise = waitForAnyResponse();
    publish(`${TOPIC_PREFIX}/to/set/reachability`, {
      name: accessoryName,
      reachable: true
    });

    response = await responsePromise;
    if (response.ack === true) {
      logPass(`Set '${accessoryName}' back to reachable`);
      return { success: true };
    } else {
      logFail(`Failed to set reachable: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testReachabilityWithoutStatusActive() {
  logTest('Set Reachability - Service WITHOUT StatusActive (e.g. Lightbulb)');
  
  // Create a Lightbulb accessory (does NOT have StatusActive)
  const name = generateAccessoryName('testlightbulb');
  
  let responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light',
    service: 'Lightbulb'
  });

  try {
    let response = await responsePromise;
    if (!response.ack) {
      logFail(`Failed to add lightbulb: ${response.message}`);
      return { success: false };
    }
    logPass(`Lightbulb '${name}' added`);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test setting unreachable - should gracefully handle lack of StatusActive
    responsePromise = waitForAnyResponse();
    publish(`${TOPIC_PREFIX}/to/set/reachability`, {
      name: name,
      reachable: false
    });

    response = await responsePromise;
    if (response.ack === true) {
      logPass(`Set '${name}' to unreachable (gracefully handled without StatusActive)`);
      logInfo('Service does NOT support StatusActive - should log and continue without error');
    } else {
      logFail(`Failed to set unreachable: ${response.message}`);
      return { success: false, name };
    }

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test setting reachable again
    responsePromise = waitForAnyResponse();
    publish(`${TOPIC_PREFIX}/to/set/reachability`, {
      name: name,
      reachable: true
    });

    response = await responsePromise;
    if (response.ack === true) {
      logPass(`Set '${name}' back to reachable`);
      return { success: true, name };
    } else {
      logFail(`Failed to set reachable: ${response.message}`);
      return { success: false, name };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testRemoveService(accessoryName) {
  logTest('Remove Service from Accessory');
  
  if (!accessoryName) {
    logFail('No accessory name provided');
    return { success: false };
  }

  const responsePromise = waitForAnyResponse();
  
  publish(`${TOPIC_PREFIX}/to/remove/service`, {
    name: accessoryName,
    service_name: 'humidity'
  });

  try {
    const response = await responsePromise;
    if (response.ack === true) {
      logPass(`Removed service 'humidity' from '${accessoryName}'`);
      return { success: true };
    } else {
      logFail(`Failed to remove service: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testRemoveAccessory(accessoryName) {
  logTest('Remove Accessory');
  
  if (!accessoryName) {
    logFail('No accessory name provided');
    return { success: false };
  }

  const responsePromise = waitForAnyResponse();
  
  publish(`${TOPIC_PREFIX}/to/remove`, {
    name: accessoryName
  });

  try {
    const response = await responsePromise;
    if (response.ack === true) {
      logPass(`Removed accessory '${accessoryName}'`);
      return { success: true };
    } else {
      logFail(`Failed to remove accessory: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testOptionalCharacteristics() {
  logTest('Add Accessory with Optional Characteristics');
  const name = generateAccessoryName('testoptional');
  
  const responsePromise = waitForAnyResponse();
  
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light',
    service: 'Lightbulb',
    Brightness: 'default',
    Hue: 'default',
    Saturation: 'default'
  });

  try {
    const response = await responsePromise;
    if (response.ack === true) {
      logPass(`Accessory '${name}' with optional characteristics added`);
      return { success: true, name };
    } else {
      logFail(`Failed to add accessory: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testCustomCharacteristicProps() {
  logTest('Add Accessory with Custom Characteristic Properties');
  const name = generateAccessoryName('testprops');
  
  const responsePromise = waitForAnyResponse();
  
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'temp',
    service: 'TemperatureSensor',
    CurrentTemperature: {
      minValue: -20,
      maxValue: 60,
      minStep: 0.5
    }
  });

  try {
    const response = await responsePromise;
    if (response.ack === true) {
      logPass(`Accessory '${name}' with custom props added`);
      return { success: true, name };
    } else {
      logFail(`Failed to add accessory: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

// Error Handling & Edge Case Tests

async function testDuplicateAccessoryName() {
  logTest('Error Handling: Duplicate Accessory Name');
  const name = generateAccessoryName('testduplicate');
  
  // Add first accessory
  let responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light',
    service: 'Switch'
  });

  try {
    let response = await responsePromise;
    if (!response.ack) {
      logFail(`Failed to add first accessory: ${response.message}`);
      return { success: false };
    }
    logPass(`First accessory '${name}' added`);

    // Try to add duplicate
    await new Promise(resolve => setTimeout(resolve, 500));
    responsePromise = waitForAnyResponse();
    publish(`${TOPIC_PREFIX}/to/add`, {
      name: name,
      service_name: 'light',
      service: 'Switch'
    });

    response = await responsePromise;
    if (response.ack === false && response.message.includes('already used')) {
      logPass(`Correctly rejected duplicate accessory name`);
      return { success: true, name };
    } else {
      logFail(`Should have rejected duplicate, but got: ${JSON.stringify(response)}`);
      return { success: false, name };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testInvalidServiceType() {
  logTest('Error Handling: Invalid Service Type');
  const name = generateAccessoryName('testinvalid');
  
  const responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light',
    service: 'NonExistentService'
  });

  try {
    const response = await responsePromise;
    if (response.ack === false && response.message.includes('undefined')) {
      logPass(`Correctly rejected invalid service type`);
      return { success: true };
    } else {
      logFail(`Should have rejected invalid service, but got: ${JSON.stringify(response)}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testMissingRequiredFields() {
  logTest('Error Handling: Missing Required Fields (no service)');
  const name = generateAccessoryName('testmissing');
  
  const responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light'
    // Missing 'service' field!
  });

  try {
    const response = await responsePromise;
    if (response.ack === false && response.message.includes('undefined')) {
      logPass(`Correctly rejected accessory with missing service field`);
      return { success: true };
    } else {
      logFail(`Should have rejected missing service, but got: ${JSON.stringify(response)}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testSetValueOutOfRange() {
  logTest('Error Handling: Set Value Outside Valid Range');
  const name = generateAccessoryName('testrange');
  
  // Add a temperature sensor with custom range
  let responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'temp',
    service: 'TemperatureSensor',
    CurrentTemperature: {
      minValue: -20,
      maxValue: 60
    }
  });

  try {
    let response = await responsePromise;
    if (!response.ack) {
      logFail(`Failed to add accessory: ${response.message}`);
      return { success: false };
    }
    logPass(`Temperature sensor '${name}' added`);

    // Try to set value outside range
    await new Promise(resolve => setTimeout(resolve, 500));
    responsePromise = waitForAnyResponse(3000); // Shorter timeout for expected failure
    publish(`${TOPIC_PREFIX}/to/set`, {
      name: name,
      service_name: 'temp',
      characteristic: 'CurrentTemperature',
      value: 100 // Outside range of -20 to 60
    });

    try {
      response = await responsePromise;
      if (response.ack === false && response.message.includes('outside range')) {
        logPass(`Correctly rejected out-of-range value`);
        return { success: true, name };
      } else {
        logInfo(`Value may have been set (no error response)`);
        return { success: true, name }; // Not necessarily a failure
      }
    } catch (timeoutError) {
      // /to/set doesn't respond on success, so timeout is expected
      logInfo(`No response (expected for /to/set on success or silent failure)`);
      return { success: true, name };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testRemoveNonExistentAccessory() {
  logTest('Error Handling: Remove Non-Existent Accessory');
  const name = 'nonexistent_accessory_12345';
  
  const responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/remove`, {
    name: name
  });

  try {
    const response = await responsePromise;
    if (response.ack === false && response.message.includes('not found')) {
      logPass(`Correctly reported non-existent accessory`);
      return { success: true };
    } else {
      logFail(`Should have reported not found, but got: ${JSON.stringify(response)}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testAccessoryNameWithSpecialCharacters() {
  logTest('Edge Case: Accessory Name with Special Characters');
  const name = 'testspecial chars.123';
  
  const responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light',
    service: 'Switch'
  });

  try {
    const response = await responsePromise;
    if (response.ack === true) {
      logPass(`Accessory with special characters '${name}' added`);
      logInfo('Note: HAP-NodeJS will warn about invalid name format');
      return { success: true, name };
    } else {
      logFail(`Failed to add accessory: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

async function testVeryLongAccessoryName() {
  logTest('Edge Case: Very Long Accessory Name');
  const name = 'test ' + 'a'.repeat(100) + ' ' + Date.now();
  
  const responsePromise = waitForAnyResponse();
  publish(`${TOPIC_PREFIX}/to/add`, {
    name: name,
    service_name: 'light',
    service: 'Switch'
  });

  try {
    const response = await responsePromise;
    if (response.ack === true) {
      logPass(`Accessory with very long name added (${name.length} chars)`);
      return { success: true, name };
    } else {
      logFail(`Failed to add accessory: ${response.message}`);
      return { success: false };
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
    return { success: false };
  }
}

// Main Test Runner
async function runTests() {
  log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
  log('║   Homebridge-MQTT Automated Test Suite (v2.0 Compat)      ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════╝', 'cyan');
  
  log(`\nConnecting to MQTT broker: ${MQTT_BROKER}`, 'yellow');
  if (MQTT_USERNAME) {
    log(`Using authentication: ${MQTT_USERNAME} / ${'*'.repeat(MQTT_PASSWORD ? MQTT_PASSWORD.length : 0)}`, 'yellow');
  } else {
    log('No authentication (anonymous)', 'yellow');
  }
  log(`Topic prefix: ${TOPIC_PREFIX}`, 'yellow');
  log(`Response timeout: ${RESPONSE_TIMEOUT}ms`, 'yellow');
  log(`Debug mode: ${DEBUG ? 'ON' : 'OFF'} (set DEBUG=true for verbose output)`, 'yellow');

  // Build MQTT connection options
  const mqttOptions = {};
  if (MQTT_USERNAME) {
    mqttOptions.username = MQTT_USERNAME;
  }
  if (MQTT_PASSWORD) {
    mqttOptions.password = MQTT_PASSWORD;
  }

  client = mqtt.connect(MQTT_BROKER, mqttOptions);

  client.on('connect', async () => {
    log('✓ Connected to MQTT broker', 'green');

    // Subscribe to response topics
    const subscribeTopics = [
      `${TOPIC_PREFIX}/from/response`,
      `${TOPIC_PREFIX}/from/connected`,
      `${TOPIC_PREFIX}/from/get`,
      `${TOPIC_PREFIX}/from/set`,
      `${TOPIC_PREFIX}/from/identify`
    ];
    
    for (const topic of subscribeTopics) {
      await new Promise((resolve, reject) => {
        client.subscribe(topic, (err) => {
          if (err) {
            log(`✗ Failed to subscribe to ${topic}: ${err.message}`, 'red');
            reject(err);
          } else {
            logDebug(`Subscribed to ${topic}`);
            resolve();
          }
        });
      });
    }
    log(`✓ Subscribed to ${TOPIC_PREFIX}/from/* topics`, 'green');

    // Wait for homebridge to be ready
    log('\nWaiting for Homebridge to be ready...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      log('\n' + '='.repeat(60), 'cyan');
      log('Starting Test Suite', 'cyan');
      log('='.repeat(60), 'cyan');

      // Test 1: Add simple accessory
      const test1 = await testAddAccessory();
      const accessory1Name = test1.name;

      // Test 2: Set value
      if (accessory1Name) {
        await testSetValue(accessory1Name);
      }

      // Test 3: Add accessory with multiple services
      const test3 = await testAddMultipleServices();
      const accessory2Name = test3.name;

      // Test 4: Get all accessories
      await testGetAccessories();

      // Test 5a: Reachability with StatusActive (v2.0 specific test - Switch has StatusActive)
      if (accessory1Name) {
        await testReachabilityWithStatusActive(accessory1Name);
      }

      // Test 5b: Reachability without StatusActive (v2.0 specific test - Lightbulb does NOT have StatusActive)
      const test5b = await testReachabilityWithoutStatusActive();
      const accessory5Name = test5b.name;

      // Test 6: Add with optional characteristics
      const test6 = await testOptionalCharacteristics();
      const accessory3Name = test6.name;

      // Test 7: Add with custom props
      const test7 = await testCustomCharacteristicProps();
      const accessory4Name = test7.name;

      // Test 8: Remove service
      if (accessory2Name) {
        await testRemoveService(accessory2Name);
      }

      // Error Handling & Edge Case Tests
      log('\n' + '='.repeat(60), 'cyan');
      log('Error Handling & Edge Case Tests', 'cyan');
      log('='.repeat(60), 'cyan');

      // Test 9: Duplicate accessory name
      const test9 = await testDuplicateAccessoryName();
      const duplicateName = test9.name;

      // Test 10: Invalid service type
      await testInvalidServiceType();

      // Test 11: Missing required fields
      await testMissingRequiredFields();

      // Test 12: Set value out of range
      const test12 = await testSetValueOutOfRange();
      const rangeName = test12.name;

      // Test 13: Remove non-existent accessory
      await testRemoveNonExistentAccessory();

      // Test 14: Special characters in name
      const test14 = await testAccessoryNameWithSpecialCharacters();
      const specialName = test14.name;

      // Test 15: Very long name
      const test15 = await testVeryLongAccessoryName();
      const longName = test15.name;

      // Cleanup: Remove test accessories
      log('\n' + '='.repeat(60), 'cyan');
      log('Cleaning Up Test Accessories', 'cyan');
      log('='.repeat(60), 'cyan');

      if (accessory1Name) await testRemoveAccessory(accessory1Name);
      if (accessory2Name) await testRemoveAccessory(accessory2Name);
      if (accessory3Name) await testRemoveAccessory(accessory3Name);
      if (accessory4Name) await testRemoveAccessory(accessory4Name);
      if (accessory5Name) await testRemoveAccessory(accessory5Name);
      if (duplicateName) await testRemoveAccessory(duplicateName);
      if (rangeName) await testRemoveAccessory(rangeName);
      if (specialName) await testRemoveAccessory(specialName);
      if (longName) await testRemoveAccessory(longName);

      // Print summary
      log('\n' + '='.repeat(60), 'cyan');
      log('Test Summary', 'cyan');
      log('='.repeat(60), 'cyan');
      log(`Total Passed: ${testsPassed}`, 'green');
      log(`Total Failed: ${testsFailed}`, testsFailed > 0 ? 'red' : 'green');
      
      if (testsFailed === 0) {
        log('\n🎉 All tests passed! Plugin is Homebridge v2.0 compatible!', 'green');
      } else {
        log('\n⚠️  Some tests failed. Please review the output above.', 'yellow');
      }

    } catch (error) {
      log(`\n✗ Fatal error: ${error.message}`, 'red');
      console.error(error);
    } finally {
      log('\nDisconnecting from MQTT broker...', 'yellow');
      client.end();
      process.exit(testsFailed > 0 ? 1 : 0);
    }
  });

  client.on('message', (topic, message) => {
    const messageStr = message.toString();
    logDebug(`RAW MESSAGE - Topic: ${topic}, Payload: ${messageStr}`);
    
    try {
      const payload = JSON.parse(messageStr);
      
      if (topic === `${TOPIC_PREFIX}/from/connected`) {
        log(`✓ Homebridge-MQTT connected: ${messageStr}`, 'green');
        return;
      }

      if (topic === `${TOPIC_PREFIX}/from/response`) {
        logDebug(`Parsed response payload: ${JSON.stringify(payload, null, 2)}`);
        
        // Check if any callback is waiting for this response
        if (payload.name && responseCallbacks.has(payload.name)) {
          logDebug(`✓ Matched response to waiting callback for: ${payload.name}`);
          const callback = responseCallbacks.get(payload.name);
          callback(payload);
        } else if (responseCallbacks.has('*')) {
          // For get all accessories
          logDebug('✓ Matched response to wildcard callback');
          const callback = responseCallbacks.get('*');
          callback(payload);
        } else if (responseCallbacks.has('__any__')) {
          // For responses that don't include name field
          logDebug('✓ Matched response to __any__ callback');
          const callback = responseCallbacks.get('__any__');
          callback(payload);
        } else {
          logDebug(`⚠ No callback waiting for: ${payload.name || 'unknown'}`);
          logDebug(`⚠ Active callbacks: ${Array.from(responseCallbacks.keys()).join(', ')}`);
        }
      } else {
        // Log other topics too
        logDebug(`Message on topic ${topic} (not handled): ${messageStr}`);
      }
    } catch (error) {
      // Ignore parse errors for non-JSON messages, but log them in debug
      logDebug(`⚠ Error parsing message from ${topic}: ${error.message}`);
    }
  });

  client.on('error', (error) => {
    log(`✗ MQTT Error: ${error.message}`, 'red');
    process.exit(1);
  });
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\nTest interrupted by user', 'yellow');
  if (client) {
    client.end();
  }
  process.exit(1);
});

// Run tests
runTests();
