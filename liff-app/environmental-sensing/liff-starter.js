const ENVIRONMENTAL_SENSING_SERVICE_UUID = "0000181A-0000-1000-8000-00805F9B34FB";//not user ssid dont change
//const PRESSURE_CHARACTERISTIC_UUID = "00002A6D-0000-1000-8000-00805F9B34FB";
const TEMPERATURE_CHARACTERISTIC_UUID = "00002A6E-0000-1000-8000-00805F9B34FB";
const HUMIDTY_CHARACTERISTIC_UUID = "00002A6F-0000-1000-8000-00805F9B34FB";

// User service UUID: Change this to your generated service UUID
const USER_SERVICE_UUID         = '4682E645-69BC-4E8A-957C-81D3B24015BB'//'4682E645-69BC-4E8A-957C-81D3B24015BB'; // LED, Button
// User service characteristics
const LED_CHARACTERISTIC_UUID   = 'E9062E71-9E62-4BC6-B0D3-35CDCD9B027B';
const BTN_CHARACTERISTIC_UUID   = '62FBD229-6EDD-4D1A-B554-5C4E1BB29169';

// PSDI Service UUID: Fixed value for Developer Trial
const PSDI_SERVICE_UUID         = 'E625601E-9E55-4597-A598-76018A0D293D'; // Device ID
const PSDI_CHARACTERISTIC_UUID  = '26E2B12B-85F0-4F3F-9FDD-91D114270E6E';

// UI settings
let ledState = false; // true: LED on, false: LED off
let clickCount = 0;


const deviceUUIDSet = new Set();
const connectedUUIDSet = new Set();
const connectingUUIDSet = new Set();

let logNumber = 1;

function onScreenLog(text) {
    const logbox = document.getElementById('logbox');
    logbox.value += '#' + logNumber + '> ';
    logbox.value += text;
    logbox.value += '\n';
    logbox.scrollTop = logbox.scrollHeight;
    logNumber++;
}

window.onload = () => {
    initializeApp();///////led part
    liff.init(async () => {
        onScreenLog('LIFF initialized');
        renderVersionField();

        await liff.initPlugins(['bluetooth']);
        onScreenLog('BLE plugin initialized');

        checkAvailablityAndDo(() => {
            onScreenLog('Finding devices...');
            findDevice();
        });
    }, e => {
        flashSDKError(e);
        onScreenLog(`ERROR on getAvailability: ${e}`);
    });
}

async function checkAvailablityAndDo(callbackIfAvailable) {
    const isAvailable = await liff.bluetooth.getAvailability().catch(e => {
        flashSDKError(e);
        onScreenLog(`ERROR on getAvailability: ${e}`);
        return false;
    });
    // onScreenLog("Check availablity: " + isAvailable);

    if (isAvailable) {
        document.getElementById('alert-liffble-notavailable').style.display = 'none';
        callbackIfAvailable();
    } else {
        document.getElementById('alert-liffble-notavailable').style.display = 'block';
        setTimeout(() => checkAvailablityAndDo(callbackIfAvailable), 1000);
    }
}

// Find LINE Things device using requestDevice()
async function findDevice() {
    const device = await liff.bluetooth.requestDevice().catch(e => {
        flashSDKError(e);
        onScreenLog(`ERROR on requestDevice: ${e}`);
        throw e;
    });
    // onScreenLog('detect: ' + device.id);

    try {
        if (!deviceUUIDSet.has(device.id)) {
            deviceUUIDSet.add(device.id);
            addDeviceToList(device);
        } else {
            // TODO: Maybe this is unofficial hack > device.rssi
            document.querySelector(`#${device.id} .rssi`).innerText = device.rssi;
        }

        checkAvailablityAndDo(() => setTimeout(findDevice, 100));
    } catch (e) {
        onScreenLog(`ERROR on findDevice: ${e}\n${e.stack}`);
    }
}

// Add device to found device list
function addDeviceToList(device) {
    onScreenLog('Device found: ' + device.name);

    const deviceList = document.getElementById('device-list');
    const deviceItem = document.getElementById('device-list-item').cloneNode(true);
    deviceItem.setAttribute('id', device.id);
    deviceItem.querySelector(".device-id").innerText = device.id;
    deviceItem.querySelector(".device-name").innerText = device.name;
    deviceItem.querySelector(".rssi").innerText = device.rssi;
    deviceItem.classList.add("d-flex");
    deviceItem.addEventListener('click', () => {
        deviceItem.classList.add("active");
        try {
            connectDevice(device);
        } catch (e) {
            onScreenLog('Initializing device failed. ' + e);
        }
    });
    deviceList.appendChild(deviceItem);
}

// Select target device and connect it
function connectDevice(device) {
    onScreenLog('Device selected: ' + device.name);

    if (!device) {
        onScreenLog('No devices found. You must request a device first.');
    } else if (connectingUUIDSet.has(device.id) || connectedUUIDSet.has(device.id)) {
        onScreenLog('Already connected to this device.');
    } else {
        connectingUUIDSet.add(device.id);
        initializeCardForDevice(device);

        // Wait until the requestDevice call finishes before setting up the disconnect listner
        const disconnectCallback = () => {
            updateConnectionStatus(device, 'disconnected');
            device.removeEventListener('gattserverdisconnected', disconnectCallback);
        };
        device.addEventListener('gattserverdisconnected', disconnectCallback);

        onScreenLog('Connecting ' + device.name);
        device.gatt.connect().then(() => {
            updateConnectionStatus(device, 'connected');
            connectingUUIDSet.delete(device.id);
        }).catch(e => {
            flashSDKError(e);
            onScreenLog(`ERROR on gatt.connect(${device.id}): ${e}`);
            updateConnectionStatus(device, 'error');
            connectingUUIDSet.delete(device.id);
        });
    }
}

// Setup device information card
function initializeCardForDevice(device) {
    const template = document.getElementById('device-template').cloneNode(true);
    const cardId = 'device-' + device.id;

    template.style.display = 'block';
    template.setAttribute('id', cardId);
    template.querySelector('.card > .card-header > .device-name').innerText = device.name;

    // Device disconnect button
    template.querySelector('.device-disconnect').addEventListener('click', () => {
        onScreenLog('Clicked disconnect button');
        device.gatt.disconnect();
    });

    template.querySelector('.refresh-value').addEventListener('click', () => {
        refreshValues(device).catch(e => onScreenLog(`ERROR on refreshValues(): ${e}\n${e.stack}`));
    });

    // Remove existing same id card
    const oldCardElement = getDeviceCard(device);
    if (oldCardElement && oldCardElement.parentNode) {
        oldCardElement.parentNode.removeChild(oldCardElement);
    }

    document.getElementById('device-cards').appendChild(template);
    onScreenLog('Device card initialized: ' + device.name);
}

// Update Connection Status
function updateConnectionStatus(device, status) {
    if (status == 'connected') {
        onScreenLog('Connected to ' + device.name);
        connectedUUIDSet.add(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-primary btn-sm disabled');
        statusBtn.innerText = "Connected";
        getDeviceDisconnectButton(device).style.display = 'inline-block';
        getDeviceCardBody(device).style.display = 'block';
    } else if (status == 'disconnected') {
        onScreenLog('Disconnected from ' + device.name);
        connectedUUIDSet.delete(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-secondary btn-sm disabled');
        statusBtn.innerText = "Disconnected";
        getDeviceDisconnectButton(device).style.display = 'none';
        getDeviceCardBody(device).style.display = 'none';
        document.getElementById(device.id).classList.remove('active');
    } else {
        onScreenLog('Connection Status Unknown ' + status);
        connectedUUIDSet.delete(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-danger btn-sm disabled');
        statusBtn.innerText = "Error";
        getDeviceDisconnectButton(device).style.display = 'none';
        getDeviceCardBody(device).style.display = 'none';
        document.getElementById(device.id).classList.remove('active');
    }
}

async function refreshValues(device) {
//     const pressureCharacteristic = await getCharacteristic(
//         device, ENVIRONMENTAL_SENSING_SERVICE_UUID, PRESSURE_CHARACTERISTIC_UUID);
    const temperatureCharacteristic = await getCharacteristic(
        device, ENVIRONMENTAL_SENSING_SERVICE_UUID, TEMPERATURE_CHARACTERISTIC_UUID);
    const humidityCharacteristic = await getCharacteristic(
        device, ENVIRONMENTAL_SENSING_SERVICE_UUID, HUMIDTY_CHARACTERISTIC_UUID);

//     const pressureBuffer = await readCharacteristic(pressureCharacteristic).catch(e => {
//         return null;
//     });
    const temperatureBuffer = await readCharacteristic(temperatureCharacteristic).catch(e => {
        return null;
    });
    const humidityBuffer = await readCharacteristic(humidityCharacteristic).catch(e => {
        return null;
    });

    /*if (pressureBuffer !== null) {
        const pressureValue = pressureBuffer.getUint32(0, true) / 10.0 / 100.0;//test const
        getDevicePressureField(device).innerText = `${pressureValue} hPa`;
    }*/
    if (temperatureBuffer !== null) {
        const temperatureValue = temperatureBuffer.getInt16(0, true) / 100.0;
        getDeviceTemperatureField(device).innerText = `${temperatureValue} ℃`;
    }
    if (humidityBuffer !== null) {
        const humidityValue = humidityBuffer.getUint16(0, true) / 100.0;
        getDeviceHumidityField(device).innerText = `${humidityValue} %`;
    }
}

async function readCharacteristic(characteristic) {
    const response = await characteristic.readValue().catch(e => {
        onScreenLog(`Error reading ${characteristic.uuid}: ${e}`);
        throw e;
    });
    if (response) {
        onScreenLog(`Read ${characteristic.uuid}: ${buf2hex(response.buffer)}`);
        const values = new DataView(response.buffer);
        return values;
    } else {
        throw 'Read value is empty?';
    }
}

async function writeCharacteristic(characteristic, command) {
    await characteristic.writeValue(new Uint8Array(command)).catch(e => {
        onScreenLog(`Error writing ${characteristic.uuid}: ${e}`);
        throw e;
    });
    //onScreenLog(`Wrote ${characteristic.uuid}: ${command}`);
}

async function getCharacteristic(device, serviceId, characteristicId) {
    const service = await device.gatt.getPrimaryService(serviceId).catch(e => {
        flashSDKError(e);
        throw e;
    });
    const characteristic = await service.getCharacteristic(characteristicId).catch(e => {
        flashSDKError(e);
        throw e;
    });
    onScreenLog(`Got characteristic ${serviceId} ${characteristicId} ${device.id}`);
    return characteristic;
}

function getDeviceCard(device) {
    return document.getElementById('device-' + device.id);
}

function getDeviceCardBody(device) {
    return getDeviceCard(device).getElementsByClassName('card-body')[0];
}

function getDeviceStatusButton(device) {
    return getDeviceCard(device).getElementsByClassName('device-status')[0];
}

function getDeviceDisconnectButton(device) {
    return getDeviceCard(device).getElementsByClassName('device-disconnect')[0];
}

function getDeviceTemperatureField(device) {
    return getDeviceCard(device).getElementsByClassName('temperature-value')[0];
}

function getDeviceHumidityField(device) {
    return getDeviceCard(device).getElementsByClassName('humidity-value')[0];
}

// function getDevicePressureField(device) {
//     return getDeviceCard(device).getElementsByClassName('pressure-value')[0];
// }

function renderVersionField() {
    const element = document.getElementById('sdkversionfield');
    const versionElement = document.createElement('p')
        .appendChild(document.createTextNode('SDK Ver: ' + liff._revision));
    element.appendChild(versionElement);
}

function flashSDKError(error){
    window.alert('SDK Error: ' + error.code);
    window.alert('Message: ' + error.message);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buf2hex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}
// ----------------- //
// Handler functions //
// ----------------- //

function handlerToggleLed() {
    ledState = !ledState;

    uiToggleLedButton(ledState);
    liffToggleDeviceLedState(ledState);
}

// ------------ //
// UI functions //
// ------------ //

function uiToggleLedButton(state) {
    const el = document.getElementById("btn-led-toggle");
    el.innerText = state ? "Switch LED OFF" : "Switch LED ON";

    if (state) {
      el.classList.add("led-on");
    } else {
      el.classList.remove("led-on");
    }
}

function uiCountPressButton() {
    clickCount++;

    const el = document.getElementById("click-count");
    el.innerText = clickCount;
}

function uiToggleStateButton(pressed) {
    const el = document.getElementById("btn-state");

    if (pressed) {
        el.classList.add("pressed");
        el.innerText = "Pressed";
    } else {
        el.classList.remove("pressed");
        el.innerText = "Released";
    }
}

function uiToggleDeviceConnected(connected) {
    const elStatus = document.getElementById("status");
    const elControls = document.getElementById("controls");

    elStatus.classList.remove("error");

    if (connected) {
        // Hide loading animation
        uiToggleLoadingAnimation(false);
        // Show status connected
        elStatus.classList.remove("inactive");
        elStatus.classList.add("success");
        elStatus.innerText = "Device connected";
        // Show controls
        elControls.classList.remove("hidden");
    } else {
        // Show loading animation
        uiToggleLoadingAnimation(true);
        // Show status disconnected
        elStatus.classList.remove("success");
        elStatus.classList.add("inactive");
        elStatus.innerText = "Device disconnected";
        // Hide controls
        elControls.classList.add("hidden");
    }
}

function uiToggleLoadingAnimation(isLoading) {
    const elLoading = document.getElementById("loading-animation");

    if (isLoading) {
        // Show loading animation
        elLoading.classList.remove("hidden");
    } else {
        // Hide loading animation
        elLoading.classList.add("hidden");
    }
}

function uiStatusError(message, showLoadingAnimation) {
    uiToggleLoadingAnimation(showLoadingAnimation);

    const elStatus = document.getElementById("status");
    const elControls = document.getElementById("controls");

    // Show status error
    elStatus.classList.remove("success");
    elStatus.classList.remove("inactive");
    elStatus.classList.add("error");
    elStatus.innerText = message;

    // Hide controls
    elControls.classList.add("hidden");
}

function makeErrorMsg(errorObj) {
    return "Error\n" + errorObj.code + "\n" + errorObj.message;
}

// -------------- //
// LIFF functions //
// -------------- //

function initializeApp() {
    liff.init(() => initializeLiff(), error => uiStatusError(makeErrorMsg(error), false));
}

function initializeLiff() {
    liff.initPlugins(['bluetooth']).then(() => {
        liffCheckAvailablityAndDo(() => liffRequestDevice());
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffCheckAvailablityAndDo(callbackIfAvailable) {
    // Check Bluetooth availability
    liff.bluetooth.getAvailability().then(isAvailable => {
        if (isAvailable) {
            uiToggleDeviceConnected(false);
            callbackIfAvailable();
        } else {
            uiStatusError("Bluetooth not available", true);
            setTimeout(() => liffCheckAvailablityAndDo(callbackIfAvailable), 10000);
        }
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });;
}

function liffRequestDevice() {
    liff.bluetooth.requestDevice().then(device => {
        liffConnectToDevice(device);
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffConnectToDevice(device) {
    device.gatt.connect().then(() => {
        document.getElementById("device-name").innerText = device.name;
        document.getElementById("device-id").innerText = device.id;

        // Show status connected
        uiToggleDeviceConnected(true);

        // Get service
        device.gatt.getPrimaryService(USER_SERVICE_UUID).then(service => {
            liffGetUserService(service);
        }).catch(error => {
            uiStatusError(makeErrorMsg(error), false);
        });
        device.gatt.getPrimaryService(PSDI_SERVICE_UUID).then(service => {
            liffGetPSDIService(service);
        }).catch(error => {
            uiStatusError(makeErrorMsg(error), false);
        });

        // Device disconnect callback
        const disconnectCallback = () => {
            // Show status disconnected
            uiToggleDeviceConnected(false);

            // Remove disconnect callback
            device.removeEventListener('gattserverdisconnected', disconnectCallback);

            // Reset LED state
            ledState = false;
            // Reset UI elements
            uiToggleLedButton(false);
            uiToggleStateButton(false);

            // Try to reconnect
            initializeLiff();
        };

        device.addEventListener('gattserverdisconnected', disconnectCallback);
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffGetUserService(service) {
    // Button pressed state
    service.getCharacteristic(BTN_CHARACTERISTIC_UUID).then(characteristic => {
        liffGetButtonStateCharacteristic(characteristic);
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });

    // Toggle LED
    service.getCharacteristic(LED_CHARACTERISTIC_UUID).then(characteristic => {
        window.ledCharacteristic = characteristic;

        // Switch off by default
        liffToggleDeviceLedState(false);
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffGetPSDIService(service) {
    // Get PSDI value
    service.getCharacteristic(PSDI_CHARACTERISTIC_UUID).then(characteristic => {
        return characteristic.readValue();
    }).then(value => {
        // Byte array to hex string
        const psdi = new Uint8Array(value.buffer)
            .reduce((output, byte) => output + ("0" + byte.toString(16)).slice(-2), "");
        document.getElementById("device-psdi").innerText = psdi;
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffGetButtonStateCharacteristic(characteristic) {
    // Add notification hook for button state
    // (Get notified when button state changes)
    characteristic.startNotifications().then(() => {
        characteristic.addEventListener('characteristicvaluechanged', e => {
            const val = (new Uint8Array(e.target.value.buffer))[0];
            if (val > 0) {
                // press
                uiToggleStateButton(true);
            } else {
                // release
                uiToggleStateButton(false);
                uiCountPressButton();
            }
        });
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffToggleDeviceLedState(state) {
    // on: 0x01
    // off: 0x00
    window.ledCharacteristic.writeValue(
        state ? new Uint8Array([0x01]) : new Uint8Array([0x00])
    ).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}
