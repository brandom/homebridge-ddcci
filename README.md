# Homebridge DDC/CI Plugin

Control any DDC/CI capable display from Homebridge. Currently supports on/off and input selection. The config example given below uses the Linux `ddcutil` utility but should be compatible with any CLI utility by configuring the commands and reponse pattern.

## Configuration

```json
{
  "name": "Dell Monitor DDC/CI",
  "devices": [
    {
      "uniqueId": "DellMonitor", // Unique ID for monitor
      "displayName": "Monitor", // Display name for Homekit accessory
      "manufacturer": "Dell", // Accesory info
      "model": "S-21DGF", // Accesory info
      "serialNumber": "123456789", // Accesory info
      "mode": "ssh", // Command exec mode - local or ssh
      "sshConfig": { // Required for ssh mode
        "host": "root@10.0.0.10", // SSH user/host
        "privateKey": "~/.ssh/id_rsa" // Private key or path
      },
      "onCommand": "ddcutil setvcp d6 1", // Command to turn on display
      "offCommand": "ddcutil setvcp d6 5", // Command to turn off display
      "getStatusCommand": "ddcutil getvcp d6", //Command to get on/off status
      "getInputCommand": "ddcutil getvcp 60", //Command to get current input
      "responsePattern": ".*\\(sl=(.*)\\)", //Regular expression to parse output value
      "onValue": "0x01", // Display power on value
      "sources": [
        {
          "name": "DisplayPort", //Input source name
          "activeValue": "0x0f", //Input source value (obtained from ddcutil capabilities)
          "activeCommand": "ddcutil setvcp 60 0x0f", //Command to select input source
          "additionalCommands": ["virsh-manage-usb reattach m,kb"] //Additional commands to run after switching to this input
        },
        {
          "name": "HDMI-1",
          "activeValue": "0x11",
          "activeCommand": "ddcutil setvcp 60 0x11"
        },
        {
          "name": "HDMI-2",
          "activeValue": "0x12",
          "activeCommand": "ddcutil setvcp 60 0x12"
        }
      ]
    }
  ],
  "platform": "DDC/CI"
}
```
