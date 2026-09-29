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

    // 1. Normal Live GPS Report
    if (msg_type <= 0x64) {
      if (bytes.length < 11) {
        decodedProperties.Parser_Error = "Invalid payload length for normal report";
        return { properties: decodedProperties };
      }
      var sensor_type = bytes[1];
      if (sensor_type === 0x67) { // LA3G Sensor Tag
        decodedProperties.Latitude = Number(bytesToFloat32(bytes, 3).toFixed(6));
        decodedProperties.Longitude = Number(bytesToFloat32(bytes, 7).toFixed(6));
        decodedProperties.Timestamp = new Date().toISOString();
        decodedProperties.Calculate_flag = bytes[2];
        return { properties: decodedProperties };
      }
    } 
    // 2. Join Success Report
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
    // 3. Stored Historical GPS Report
    else {
      if (bytes.length >= 14 && bytes[0] === 0x67) {
        var utcSec = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
        decodedProperties.Timestamp = new Date(utcSec * 1000).toISOString();
        decodedProperties.Calculate_flag = bytes[5];
        decodedProperties.Latitude = Number(bytesToFloat32(bytes, 6).toFixed(6));
        decodedProperties.Longitude = Number(bytesToFloat32(bytes, 10).toFixed(6));
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
