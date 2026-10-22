function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var ${name} (see apps/web/.env.local)`);
  return value;
}

// NEXT_PUBLIC_* must be read with literal property access so Next can inline them.
export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabasePublishableKey = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
