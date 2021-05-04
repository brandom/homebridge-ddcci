import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { DeviceConfig, DeviceContext } from './interfaces';
import { DisplayPlatformAccessory } from './platformAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export class DisplayPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory<DeviceContext>> = new Map();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Discovering new accesories');

      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory<DeviceContext>) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has
    // already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  discoverDevices() {
    const generateUUID = this.api.hap.uuid.generate;
    const devices: DeviceConfig[] = this.config.devices;

    // loop over the configured devices and register new/update cached
    for (const device of devices) {
      const uuid = generateUUID(device.uniqueId);
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        // the accessory already exists, update
        this.log.info('Restoring accessory from cache:', existingAccessory.displayName);

        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        new DisplayPlatformAccessory(this, existingAccessory);
        this.accessories.delete(uuid);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.displayName);

        const accessory = new this.api.platformAccessory<DeviceContext>(device.displayName, uuid);
        accessory.context.device = device;

        new DisplayPlatformAccessory(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // remove cached accessories that are no longer configured
      this.accessories.forEach((accessory) => {
        this.log.debug('Unregistering removed accesory:', device.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      });
    }
  }
}
