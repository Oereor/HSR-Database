import { loadPlannerData } from '$lib/server/action-planner';
export const prerender = true;
export async function load({ locals }) {
  return loadPlannerData(locals.locale);
}
