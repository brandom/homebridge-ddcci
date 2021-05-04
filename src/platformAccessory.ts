import retry from 'async-retry';
import { exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { join, normalize, resolve } from 'path';
import sequest from 'sequest';
import { promisify } from 'util';

import { DeviceConfig, DeviceContext } from './interfaces';
import { DisplayPlatform } from './platform';

const sshRequest = promisify(sequest);
const localExec = promisify(exec);

const resolveHome = (path) =>
  resolve(normalize(path[0] === '~' ? join(process.env.HOME!, path.slice(1)) : path));

export class DisplayPlatformAccessory {
  private displayService: Service;

  private states = {
    Active: false,
    ActiveIdentifier: 0,
  };

  private config: DeviceConfig;
  private deviceName: string;
  private log: Logger;

  constructor(
    private readonly platform: DisplayPlatform,
    private readonly accessory: PlatformAccessory<DeviceContext>
  ) {
    const Characteristic = this.platform.Characteristic;

    this.log = platform.log;
    this.config = accessory.context.device;
    this.deviceName = this.config.displayName;

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        Characteristic.Manufacturer,
        this.config.manufacturer || 'Default-Manufacturer'
      )
      .setCharacteristic(Characteristic.Model, this.config.model || 'Default-Model')
      .setCharacteristic(Characteristic.SerialNumber, this.config.serialNumber || 'Default-Serial');

    this.displayService =
      this.accessory.getService(this.platform.Service.Television) ||
      this.accessory.addService(this.platform.Service.Television);

    this.displayService
      .setCharacteristic(this.platform.Characteristic.Name, this.deviceName)
      .setCharacteristic(Characteristic.ConfiguredName, this.deviceName)
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      );

    this.displayService.setCharacteristic(
      Characteristic.ActiveIdentifier,
      this.states.ActiveIdentifier
    );

    this.displayService
      .getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .onGet(this.getActive.bind(this));

    this.displayService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .onSet(this.setActiveIdentifier.bind(this))
      .onGet(this.getActiveIdentifier.bind(this));

    for (const i in this.config.sources) {
      const source = this.config.sources[i];
      const index = parseInt(i) + 1;
      const serviceName = `${this.config.uniqueId}-INPUT+${index}`;

      const inputService =
        this.accessory.getService(serviceName) ||
        this.accessory.addService(
          this.platform.Service.InputSource,
          serviceName,
          `${this.config.uniqueId}-${source.name}`
        );

      inputService
        .setCharacteristic(Characteristic.Identifier, parseInt(i) + 1)
        .setCharacteristic(Characteristic.ConfiguredName, source.name)
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(
          Characteristic.InputSourceType,
          source.type || Characteristic.InputSourceType.HDMI
        );

      this.displayService.addLinkedService(inputService);
    }

    if (this.config.mode === 'ssh') {
      if (!this.config.sshConfig) {
        this.log.warn('SSH host config is required for ssh mode');
      } else {
        const { privateKey, publicKey } = this.config.sshConfig!;

        if (privateKey && existsSync(resolveHome(privateKey))) {
          this.config.sshConfig.privateKey = readFileSync(resolveHome(privateKey)).toString();
        }
        if (publicKey && existsSync(resolveHome(publicKey))) {
          this.config.sshConfig.publicKey = readFileSync(resolveHome(publicKey)).toString();
        }
      }
    }
  }

  a;

  async setActive(value: CharacteristicValue) {
    try {
      if (value === 1) {
        this.log.info('[%s] Power -> [on]', this.deviceName);
        await this.execCommand(this.config.onCommand);
        this.states.Active = true;
      } else {
        this.log.info('[%s] Power -> [off]', this.deviceName);
        await this.execCommand(this.config.offCommand);
        this.states.Active = false;
      }
    } catch (error) {
      this.log.error('[%s] Error setting state:', this.deviceName, error.message);
    }
  }

  async getActive(): Promise<CharacteristicValue> {
    this.log.debug('[%s] Getting current state..', this.deviceName);

    this.execCommand(this.config.getStatusCommand)
      .then((result) => {
        this.states.Active = result === this.config.onValue;
        this.displayService.updateCharacteristic(
          this.platform.Characteristic.Active,
          this.states.Active
        );
        this.log.info('[%s] Power is [%s]', this.deviceName, this.states.Active ? 'on' : 'off');
      })
      .catch((error) => {
        this.log.error('[%s] Error getting state:', this.deviceName, error.message);
      });

    return this.states.Active;
  }

  async setActiveIdentifier(value: CharacteristicValue) {
    const sourceIndex = parseInt(value as string) - 1;
    const source = this.config.sources[sourceIndex];

    this.log.info('[%s] Selecting input -> [%s]', this.deviceName, source.name);

    try {
      await this.execCommand(source?.activeCommand);
    } catch (error) {
      this.log.error('[%s] Error selecting input:', this.deviceName, error.message);
    }

    // Run additional commands
    source?.additionalCommands?.forEach(async (cmd) => {
      try {
        await this.execCommand(cmd, false);
      } catch (error) {
        this.log.warn('[%s] Failed command "%s": ', this.deviceName, cmd, error.message);
      }
    });
  }

  async getActiveIdentifier(): Promise<CharacteristicValue> {
    this.log.debug('[%s] Getting active input..', this.deviceName);

    this.execCommand(this.config.getInputCommand)
      .then((result) => {
        const activeIndex = this.config.sources.findIndex(
          (source) => source.activeValue === result
        );
        const activeName = this.config.sources[activeIndex]?.name;

        if (activeIndex > -1) {
          this.states.ActiveIdentifier = activeIndex + 1;
          this.displayService.updateCharacteristic(
            this.platform.Characteristic.ActiveIdentifier,
            this.states.ActiveIdentifier
          );
        }

        this.log.info('[%s] Input is [%s]', this.deviceName, activeName);
      })
      .catch((error) => {
        this.log.error('[%s] Error getting input:', this.deviceName, error.message);
      });

    return this.states.ActiveIdentifier;
  }

  async execCommand(command: string, retryFailed = true): Promise<string> {
    const regex = new RegExp(this.config.responsePattern.replace('\\\\', '\\'));
    const retries = retryFailed ? 5 : 0;
    const methods = {
      local: async () => {
        const { stdout, stderr } = await localExec(command);
        if (stderr) {
          throw stderr;
        }
        return stdout;
      },

      ssh: () => {
        if (!this.config.sshConfig || !this.config.sshConfig.host) {
          return Promise.resolve('');
        }

        return sshRequest(this.config.sshConfig.host, {
          command,
          ...this.config.sshConfig,
        });
      },
    };

    const stdout: string = await retry(methods[this.config.mode], {
      retries,
      onRetry: (e: Error) =>
        this.log.warn('[%s] Request failed, retrying.. (%s)', this.deviceName, e.message),
    });
    const matched = stdout.match(regex);

    return matched ? matched[1] : stdout;
  }
}
