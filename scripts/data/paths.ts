import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const siteRoot = path.resolve(import.meta.dirname, '..', '..');
export const generatedRoot = path.join(siteRoot, 'src', 'lib', 'generated');
export const staticGeneratedRoot = path.join(siteRoot, 'static', 'generated');
export const auditRoot = path.join(siteRoot, 'data', 'audit');

const requiredFiles = [
  'ExcelOutput/AvatarConfig.json',
  'ExcelOutput/AvatarConfigLD.json',
  'ExcelOutput/ItemConfigAvatarLD.json',
  'ExcelOutput/AvatarSkillConfigLD.json',
  'ExcelOutput/AvatarSkillTreeConfigLD.json',
  'ExcelOutput/AvatarRankConfigLD.json',
  'ExcelOutput/AvatarPromotionConfigLD.json',
  'ExcelOutput/AvatarGlobalBuffConfig.json',
  'ExcelOutput/EquipmentConfig.json',
  'ExcelOutput/RelicSetConfig.json',
  'ExcelOutput/ItemConfig.json',
  'ExcelOutput/MonsterTemplateConfig.json',
  'TextMap/TextMapCHS.json'
];

export function resolveDataRoot(value = process.env.HSR_DATA_ROOT): string {
  return path.resolve(siteRoot, value?.trim() || '../TurnBasedGameData');
}

export function assertDataRoot(root = resolveDataRoot()): string {
  if (!existsSync(root)) {
    throw new Error(
      `找不到上游数据目录：${root}\n请设置 HSR_DATA_ROOT，且不要让脚本自动创建或克隆该目录。`
    );
  }
  const missing = requiredFiles.filter((file) => !existsSync(path.join(root, file)));
  if (missing.length) {
    throw new Error(`HSR_DATA_ROOT 不是预期的数据仓库，缺少：${missing.join(', ')}`);
  }
  return root;
}

export function sourceCommit(root = assertDataRoot()): string {
  return execFileSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
}

export function assertInsideSite(target: string): void {
  const resolved = path.resolve(target);
  const prefix = `${siteRoot}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`拒绝写入网站仓库之外的路径：${resolved}`);
}
