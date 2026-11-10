export const ENEMY_ASSET_SCHEMA_VERSION = 4 as const;
export const ENEMY_ASSET_RESOURCE_TYPE = 'MonsterFigure' as const;
export const ENEMY_ASSET_DIRECTORY = 'generated-enemy-assets';
export const ENEMY_FIGURE_DIRECTORY = 'figures';

export function enemyFigureFileName(imageId: string): string {
  return `Monster_${imageId}.webp`;
}

export function enemyFigureUrl(imageId: string): string {
  return `/${ENEMY_ASSET_DIRECTORY}/${ENEMY_FIGURE_DIRECTORY}/${enemyFigureFileName(imageId)}`;
}
