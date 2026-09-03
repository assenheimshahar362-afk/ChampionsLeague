import "server-only";

import { io } from "next/cache";

export async function getRequestTimestamp(): Promise<number> {
  await io();
  return Date.now();
}