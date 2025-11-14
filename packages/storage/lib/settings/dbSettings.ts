import type { BaseStorageType } from '../base/types.js';

export interface DBSettingsConfig {
  enabled: boolean;
  anonymousUserId: string;
}

export type DBSettingsStorage = BaseStorageType<DBSettingsConfig> & {};
