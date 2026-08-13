import { isCategory } from '$lib/domain/constants';

export const match = (param: string): boolean => isCategory(param);
