/**
 * Shared between the sign-up action and the form that feeds it.
 *
 * Lives outside actions.ts because a "use server" module may only export async
 * functions — a plain constant there is a build error, not a lint nit.
 */

/** Supabase's own floor is 6; stating it in one place keeps the hint honest. */
export const MIN_PASSWORD_LENGTH = 12;
