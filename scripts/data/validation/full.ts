/** Run the complete semantic validator after independently reopening build inputs. */
export async function validateFull(): Promise<void> {
  await import('../validate.js');
}
