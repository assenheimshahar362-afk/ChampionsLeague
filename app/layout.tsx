import type { ReactNode } from "react";

/**
 * Next requires a root layout, but every real layout concern (html/body, dir,
 * fonts, providers) is locale-dependent and therefore lives in
 * app/[locale]/layout.tsx. This is an intentional passthrough.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
