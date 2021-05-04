export interface DeviceConfig {
  uniqueId: string;
  displayName: string;
  mode: 'local' | 'ssh';
  sshConfig?: SSHConfig;
  onCommand: string;
  offCommand: string;
  getStatusCommand: string;
  onValue: string;
  getInputCommand: string;
  sources: DeviceSource[];
  responsePattern: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
}

export interface DeviceContext {
  device: DeviceConfig;
}

export interface SSHConfig {
  host: string;
  username: string;
  password: string;
  agent: string;
  privateKey: string;
  passphrase: string;
  publicKey: string;
  proxy: string;
}

export interface DeviceSource {
  name: string;
  type: number;
  activeCommand: string;
  activeValue: string;
  additionalCommands: string[];
}
