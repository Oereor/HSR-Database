export const ENEMY_ASSET_SCHEMA_VERSION = 5 as const;
export const ENEMY_ASSET_DIRECTORY = 'generated-enemy-assets';
export const ENEMY_IMAGE_TYPES = ['MonsterMiddleIcon', 'MonsterFigure'] as const;
export type EnemyImageType = (typeof ENEMY_IMAGE_TYPES)[number];

export const ENEMY_IMAGE_DIRECTORIES: Record<EnemyImageType, string> = {
  MonsterMiddleIcon: 'icons',
  MonsterFigure: 'figures'
};

export function enemyImageFileName(imageId: string): string {
  return `Monster_${imageId}.webp`;
}

export function enemyImageUrl(type: EnemyImageType, imageId: string): string {
  return `/${ENEMY_ASSET_DIRECTORY}/${ENEMY_IMAGE_DIRECTORIES[type]}/${enemyImageFileName(imageId)}`;
}
