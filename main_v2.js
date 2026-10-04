function hexStringToBytes(hexString) {
  var bytes = [];
  var index;
  if (typeof hexString !== "string") return bytes;
  for (index = 0; index < hexString.length; index += 2) {
    bytes.push(parseInt(hexString.substr(index, 2), 16));
  }
  return bytes;
}

function bytesToFloat32(bytes, offset) {
  var buffer = new ArrayBuffer(4);
  var view = new DataView(buffer);
  view.setUint8(0, bytes[offset]);
  view.setUint8(1, bytes[offset + 1]);
  view.setUint8(2, bytes[offset + 2]);
  view.setUint8(3, bytes[offset + 3]);
  return view.getFloat32(0);
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

if (typeof globalThis.lastGpsPoint === 'undefined') {
  globalThis.lastGpsPoint = null;
}

function createEmptyDecodedProperties() {
  return {
    Latitude: null,
    Longitude: null,
    Timestamp: null,
    Calculate_flag: null,
    BatteryVoltage: null,
    SpeedKmph: null,
    Accuracy: null,
    BatteryStatus: null,
    ManagementEntityId: null,
    Parser_Error: null,
    NWifiRes: null
  };
}

function decode(message) {
  var decodedProperties = createEmptyDecodedProperties();

  try {
    var hexPayload = "";
    if (typeof message === "object" && message !== null) {
      if (message.DevEUI_uplink) {
        hexPayload = message.DevEUI_uplink.payload_hex || "";
      } else if (message.payload_hex) {
        hexPayload = message.payload_hex;
      }
    } else if (typeof message === "string") {
      hexPayload = message;
    }

    if (!hexPayload) {
      decodedProperties.Parser_Error = "Empty or invalid payload";
      return { properties: decodedProperties };
    }

    var bytes = hexStringToBytes(hexPayload);
    if (bytes.length === 0) {
      decodedProperties.Parser_Error = "Failed to convert hex string to bytes";
      return { properties: decodedProperties };
    }

    var msg_type = bytes[0];

    if (msg_type <= 0x64) {
      if (bytes.length < 11) {
        decodedProperties.Parser_Error = "Invalid payload length for normal report";
        return { properties: decodedProperties };
      }
      var sensor_type = bytes[1];
      if (sensor_type === 0x67) { // Brian-Mugie
        var currentLat = Number(bytesToFloat32(bytes, 3).toFixed(6));
        var currentLon = Number(bytesToFloat32(bytes, 7).toFixed(6));
        var currentTime = new Date();

        decodedProperties.Latitude = currentLat;
        decodedProperties.Longitude = currentLon;
        decodedProperties.Timestamp = currentTime.toISOString();
        decodedProperties.Calculate_flag = bytes[2];

        if (globalThis.lastGpsPoint) {
          var distanceMeters = calculateDistanceMeters(
            globalThis.lastGpsPoint.lat,
            globalThis.lastGpsPoint.lon,
            currentLat,
            currentLon
          );
          var timeDiffSeconds = (currentTime - globalThis.lastGpsPoint.time) / 1000;

          if (timeDiffSeconds > 0) {
            var speedMps = distanceMeters / timeDiffSeconds;
            decodedProperties.SpeedKmph = Number((speedMps * 3.6).toFixed(1));
          } else {
            decodedProperties.SpeedKmph = 0;
          }
        } else {
          decodedProperties.SpeedKmph = 0;
        }

        globalThis.lastGpsPoint = {
          lat: currentLat,
          lon: currentLon,
          time: currentTime
        };

        return { properties: decodedProperties };
      }
    } 
    else if (msg_type === 0xFF) {
      if (bytes.length < 6) {
        decodedProperties.Parser_Error = "Invalid payload length for join report";
        return { properties: decodedProperties };
      }
      var rawBattery = (bytes[2] << 8) | bytes[3];
      decodedProperties.BatteryVoltage = Number((rawBattery / 1000).toFixed(2));
      decodedProperties.Timestamp = new Date().toISOString();
      return { properties: decodedProperties };
    } 
    else {
      if (bytes.length >= 14 && bytes[0] === 0x67) {
        var utcSec = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
        var histLat = Number(bytesToFloat32(bytes, 6).toFixed(6));
        var histLon = Number(bytesToFloat32(bytes, 10).toFixed(6));
        var histTime = new Date(utcSec * 1000);

        decodedProperties.Timestamp = histTime.toISOString();
        decodedProperties.Calculate_flag = bytes[5];
        decodedProperties.Latitude = histLat;
        decodedProperties.Longitude = histLon;

        if (globalThis.lastGpsPoint) {
          var histDistance = calculateDistanceMeters(
            globalThis.lastGpsPoint.lat,
            globalThis.lastGpsPoint.lon,
            histLat,
            histLon
          );
          var histTimeDiffSec = Math.abs((histTime - globalThis.lastGpsPoint.time) / 1000);

          if (histTimeDiffSec > 0) {
            decodedProperties.SpeedKmph = Number(((histDistance / histTimeDiffSec) * 3.6).toFixed(1));
          } else {
            decodedProperties.SpeedKmph = 0;
          }
        } else {
          decodedProperties.SpeedKmph = 0;
        }

        globalThis.lastGpsPoint = {
          lat: histLat,
          lon: histLon,
          time: histTime
        };

        return { properties: decodedProperties };
      }
    }

    decodedProperties.Parser_Error = "Unknown packet format type: 0x" + msg_type.toString(16);
    return { properties: decodedProperties };

  } catch (err) {
    decodedProperties.Parser_Error = String(err);
    return { properties: decodedProperties };
  }
}

function decodeUplink(input) {
  return decode(input);
}
