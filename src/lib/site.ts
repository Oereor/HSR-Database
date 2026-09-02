export const SITE_NAME = '《崩坏：星穹铁道》档案库';

export function formatDocumentTitle(...segments: Array<string | undefined>): string {
  return [
    ...segments.filter((segment): segment is string => Boolean(segment?.trim())),
    SITE_NAME
  ].join('｜');
}
