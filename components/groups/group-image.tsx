import { Shield } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

export function GroupImage({
  imageUrl,
  name,
  className,
  sizes = "64px",
}: {
  imageUrl: string | null;
  name: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <span
      className={cn(
        "from-primary/25 via-primary/10 to-accent/15 relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br shadow-[0_10px_30px_rgb(2_7_28/0.22)]",
        className
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <Shield className="text-primary size-6" aria-hidden="true" />
      )}
    </span>
  );
}
