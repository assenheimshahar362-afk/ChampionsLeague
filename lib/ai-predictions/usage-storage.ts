export type DatabaseWriteError = {
  code?: string | null;
  message: string;
};

/** Supports rolling deploys while the cache-write token migration is pending. */
export function isMissingCacheWriteTokensColumn(
  error: DatabaseWriteError
): boolean {
  return (
    error.code === "PGRST204" &&
    error.message.toLowerCase().includes("cache_write_tokens")
  );
}
