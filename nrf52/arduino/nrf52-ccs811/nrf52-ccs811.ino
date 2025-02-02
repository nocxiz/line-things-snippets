#include <bluefruit.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_CCS811.h>
#include <ClosedCube_HDC1080.h>

/**
 * BLE CO2 + environmental sensor using CCS811 + HDC1080 + BMP280 (CJMCU-8128)
 * https://github.com/adafruit/Adafruit_CCS811
 * https://github.com/adafruit/Adafruit_BMP280_Library
 * https://github.com/techno/ClosedCube_HDC1080_Arduino
 *   based on https://github.com/closedcube/ClosedCube_HDC1080_Arduino with small fix
 */

// Device Name: Maximum 30 bytes
#define DEVICE_NAME "CO2 Monitor CCS811 - nRF52"

// User service UUID: Change this to your generated service UUID
// #define USER_SERVICE_UUID "f50d44eb-41b2-4a52-a4bd-116d31718b2e"

#define AIR_QUALITY_MONITOR_SERVICE_UUID "288BDFE4-7F85-47A6-9908-3B8F29CE69E5"
// 2byte: CO2 concentration in ppm
#define CO2_CHARACTERISTIC_UUID "9F3F3F1D-3763-4D1F-8031-58C728D7794B"
// 2byte: TVOC concentration in ppb
#define TVOC_CHARACTERISTIC_UUID "00CF24AA-BC94-437E-ABD4-241D26F72779"

#define ENVIRONMENTAL_SENSING_SERVICE_UUID 0x181A
#define PRESSURE_CHARACTERISTIC_UUID 0x2A6D
#define TEMPERATURE_CHARACTERISTIC_UUID 0x2A6E
#define HUMIDTY_CHARACTERISTIC_UUID 0x2A6F

// PSDI Service UUID: Fixed value for Developer Trial
#define PSDI_SERVICE_UUID "E625601E-9E55-4597-A598-76018A0D293D"
#define PSDI_CHARACTERISTIC_UUID "26E2B12B-85F0-4F3F-9FDD-91D114270E6E"

#define CCS811_ADDR 0x5A
#define BMP280_ADDR 0x76

uint8_t userServiceUUID[16];
uint8_t airQualityServiceUUID[16];
uint8_t co2CharacteristicUUID[16];
uint8_t tvocCharacteristicUUID[16];
uint8_t psdiServiceUUID[16];
uint8_t psdiCharacteristicUUID[16];

BLEService userService;
BLEService airQualityService;
BLECharacteristic co2Characteristic;
BLECharacteristic tvocCharacteristic;
BLEService envService;
BLECharacteristic pressureCharacteristic;
BLECharacteristic temperatureCharacteristic;
BLECharacteristic humidityCharacteristic;
BLEService psdiService;
BLECharacteristic psdiCharacteristic;

Adafruit_CCS811 ccs;
ClosedCube_HDC1080 hdc1080;
Adafruit_BMP280 bme;

SoftwareTimer timerSensor;
SoftwareTimer timerCalibration;
volatile bool refreshSensorValue = false;
volatile bool refreshCalibrationValue = false;
uint16_t currentCo2;
uint16_t currentTvoc;
uint32_t currentPressure;
int16_t currentTemperature;
uint16_t currentHumidity;

void setup() {
  Serial.begin(115200);
  Wire.begin();

  if (!ccs.begin(CCS811_ADDR)) {
    Serial.println("Failed to start CCS811 sensor! Please check your wiring.");
    while (true);
  }
  if (!bme.begin(BMP280_ADDR)) {  
    Serial.println("Could not find a valid BMP280 sensor, check wiring!");
    while (true);
  }
  hdc1080.begin(0x40);

  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName(DEVICE_NAME);

  delay(5000);
  while(!ccs.available());
  ccs.setEnvironmentalData(hdc1080.readHumidity(), hdc1080.readTemperature());

  setupServices();
  startAdvertising();
  Serial.println("Ready to Connect");

  timerSensor.begin(5000, triggerRefreshSensorValue);
  timerSensor.start();
  timerCalibration.begin(600000, triggerRefreshCalibrationValue);
  timerCalibration.start();
}

void triggerRefreshSensorValue(TimerHandle_t xTimer) {
  refreshSensorValue = true;
}

void triggerRefreshCalibrationValue(TimerHandle_t xTimer) {
  refreshCalibrationValue = true;
}

void loop() {
  if (refreshSensorValue && ccs.available() && !ccs.readData()) {
    uint16_t co2Value = ccs.geteCO2();
    uint16_t tvocValue = ccs.getTVOC();
    uint32_t pressureValue = bme.readPressure() * 10;
    int16_t temperatureValue = hdc1080.readTemperature() * 100;
    uint16_t humidityValue = hdc1080.readHumidity() * 100;

    // Set sensor values to characteristics
    if (currentCo2 != co2Value) {
      co2Characteristic.notify16(co2Value);
      currentCo2 = co2Value;
    }
    if (currentTvoc != tvocValue) {
      tvocCharacteristic.notify16(tvocValue);
      currentTvoc = tvocValue;
    }
    if (currentPressure != pressureValue) {
      pressureCharacteristic.notify32(pressureValue);
      currentPressure = pressureValue;
    }
    if (currentTemperature != temperatureValue) {
      temperatureCharacteristic.notify16((uint16_t) temperatureValue);
      currentTemperature = temperatureValue;
    }
    if (currentHumidity != humidityValue) {
      humidityCharacteristic.notify16(humidityValue);
      currentHumidity = humidityValue;
    }

    refreshSensorValue = false;

    Serial.print("Temperature = ");
    Serial.print(temperatureValue / 100);
    Serial.println(" *C");

    Serial.print("Pressure = ");
    Serial.print(pressureValue / 1000);
    Serial.println(" hPa");

    Serial.print("Humidity = ");
    Serial.print(humidityValue / 100.0);
    Serial.println(" %");

    Serial.print("CO2: ");
    Serial.print(co2Value);
    Serial.print("ppm, TVOC: ");
    Serial.print(tvocValue);
    Serial.println("ppb");

    Serial.println();
  }

  if (refreshCalibrationValue) {
    ccs.setEnvironmentalData(hdc1080.readHumidity(), hdc1080.readTemperature());
    refreshCalibrationValue = false;
  }
}

void setupServices(void) {
  // Convert String UUID to raw UUID bytes
  strUUID2Bytes(USER_SERVICE_UUID, userServiceUUID);
  strUUID2Bytes(AIR_QUALITY_MONITOR_SERVICE_UUID, airQualityServiceUUID);
  strUUID2Bytes(CO2_CHARACTERISTIC_UUID, co2CharacteristicUUID);
  strUUID2Bytes(TVOC_CHARACTERISTIC_UUID, tvocCharacteristicUUID);
  strUUID2Bytes(PSDI_SERVICE_UUID, psdiServiceUUID);
  strUUID2Bytes(PSDI_CHARACTERISTIC_UUID, psdiCharacteristicUUID);

  // Setup User Service
  userService = BLEService(userServiceUUID);
  userService.begin();

  envService = BLEService(ENVIRONMENTAL_SENSING_SERVICE_UUID);
  envService.begin();

  pressureCharacteristic = BLECharacteristic(PRESSURE_CHARACTERISTIC_UUID);
  pressureCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  pressureCharacteristic.setPermission(SECMODE_ENC_NO_MITM, SECMODE_ENC_NO_MITM);
  pressureCharacteristic.setFixedLen(4);
  pressureCharacteristic.begin();

  temperatureCharacteristic = BLECharacteristic(TEMPERATURE_CHARACTERISTIC_UUID);
  temperatureCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  temperatureCharacteristic.setPermission(SECMODE_ENC_NO_MITM, SECMODE_ENC_NO_MITM);
  temperatureCharacteristic.setFixedLen(2);
  temperatureCharacteristic.begin();

  humidityCharacteristic = BLECharacteristic(HUMIDTY_CHARACTERISTIC_UUID);
  humidityCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  humidityCharacteristic.setPermission(SECMODE_ENC_NO_MITM, SECMODE_ENC_NO_MITM);
  humidityCharacteristic.setFixedLen(2);
  humidityCharacteristic.begin();

  airQualityService = BLEService(airQualityServiceUUID);
  airQualityService.begin();

  co2Characteristic = BLECharacteristic(co2CharacteristicUUID);
  co2Characteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  co2Characteristic.setPermission(SECMODE_ENC_NO_MITM, SECMODE_ENC_NO_MITM);
  co2Characteristic.setFixedLen(2);
  co2Characteristic.begin();

  tvocCharacteristic = BLECharacteristic(tvocCharacteristicUUID);
  tvocCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  tvocCharacteristic.setPermission(SECMODE_ENC_NO_MITM, SECMODE_ENC_NO_MITM);
  tvocCharacteristic.setFixedLen(2);
  tvocCharacteristic.begin();

  // Setup PSDI Service
  psdiService = BLEService(psdiServiceUUID);
  psdiService.begin();

  psdiCharacteristic = BLECharacteristic(psdiCharacteristicUUID);
  psdiCharacteristic.setProperties(CHR_PROPS_READ);
  psdiCharacteristic.setPermission(SECMODE_ENC_NO_MITM, SECMODE_NO_ACCESS);
  psdiCharacteristic.setFixedLen(sizeof(uint32_t) * 2);
  psdiCharacteristic.begin();

  // Set PSDI (Product Specific Device ID) value
  uint32_t deviceAddr[] = { NRF_FICR->DEVICEADDR[0], NRF_FICR->DEVICEADDR[1] };
  psdiCharacteristic.write(deviceAddr, sizeof(deviceAddr));
}

void startAdvertising(void) {
  // Start Advertising
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(userService);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.start(0);
}

// UUID Converter
void strUUID2Bytes(String strUUID, uint8_t binUUID[]) {
  String hexString = String(strUUID);
  hexString.replace("-", "");

  for (int i = 16; i != 0 ; i--) {
    binUUID[i - 1] = hex2c(hexString[(16 - i) * 2], hexString[((16 - i) * 2) + 1]);
  }
}

char hex2c(char c1, char c2) {
  return (nibble2c(c1) << 4) + nibble2c(c2);
}

char nibble2c(char c) {
  if ((c >= '0') && (c <= '9'))
    return c - '0';
  if ((c >= 'A') && (c <= 'F'))
    return c + 10 - 'A';
  if ((c >= 'a') && (c <= 'f'))
    return c + 10 - 'a';
  return 0;
}
