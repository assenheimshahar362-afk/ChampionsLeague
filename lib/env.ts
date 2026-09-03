import { z } from "zod";

/**
 * Public environment — inlined into the client bundle at build time.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced as a literal member
 * expression for Next's compiler to substitute it. Never build these keys
 * dynamically.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "must be a valid URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  /**
   * Optional, and read only by getOrigin() as a last resort — every real
   * request carries a Host header to derive the origin from. It was required
   * once, which meant a deployment missing one unused value failed the build
   * outright: readPublicEnv() runs at module evaluation, so the whole schema
   * is all-or-nothing.
   */
  NEXT_PUBLIC_APP_URL: z.url({ message: "must be a valid URL" }).optional(),
});

function readPublicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // `|| undefined` so a variable left blank in a dashboard reads as absent
    // rather than as an empty string, which .optional() would still reject.
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid public environment variables:\n${issues}\n\n` +
        `Copy .env.example to .env.local and fill these in.`
    );
  }
  return parsed.data;
}

export const publicEnv = readPublicEnv();
