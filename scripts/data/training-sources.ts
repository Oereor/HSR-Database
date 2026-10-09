import { readSelectedTable, readTable } from './raw.js';

export const TRAINING_TABLE_NAMES = [
  'ItemConfig',
  'ExpType',
  'AvatarExpItemConfig',
  'EquipmentExpType',
  'EquipmentExpItemConfig',
  'ConstValueCommon'
] as const;

export function readTrainingSourceTable<T = Record<string, unknown>>(
  root: string,
  name: string
): Promise<T[]> {
  return name === 'ConstValueCommon'
    ? readSelectedTable<T>(root, name, 'ConstValueName', 'Exp_SoftCoin_Cost')
    : readTable<T>(root, name);
}
