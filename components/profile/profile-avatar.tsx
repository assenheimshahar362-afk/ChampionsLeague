import Image from "next/image";

import { getUploadedAvatarUrl } from "@/lib/profile/avatar";
import {
  createIdenticon,
  type IdenticonShape,
} from "@/lib/profile/identicon";

export function ProfileAvatar({
  avatarUrl,
  seed,
  alt,
  sizes,
}: {
  avatarUrl: string | null | undefined;
  seed: string;
  alt: string;
  sizes: string;
}) {
  const uploadedAvatarUrl = getUploadedAvatarUrl(avatarUrl);

  if (uploadedAvatarUrl) {
    return (
      <Image
        src={uploadedAvatarUrl}
        alt={alt}
        fill
        sizes={sizes}
        className="object-cover"
        unoptimized
      />
    );
  }

  return <ProfileIdenticon seed={seed} alt={alt} />;
}

function ProfileIdenticon({ seed, alt }: { seed: string; alt: string }) {
  const { palette, tiles } = createIdenticon(seed);
  const tileSize = 14;
  const gap = 3;
  const offset = 9;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      focusable="false"
      className="absolute inset-0 size-full"
    >
      <rect width="100" height="100" fill={palette.background} />
      {tiles.map((tile) => {
        const x = offset + tile.column * (tileSize + gap);
        const y = offset + tile.row * (tileSize + gap);

        return (
          <IdenticonShape
            key={`${tile.column}-${tile.row}`}
            shape={tile.shape}
            x={x}
            y={y}
            size={tileSize}
            color={tile.color}
          />
        );
      })}
    </svg>
  );
}

function IdenticonShape({
  shape,
  x,
  y,
  size,
  color,
}: {
  shape: IdenticonShape;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  if (shape === "circle") {
    return <circle cx={x + size / 2} cy={y + size / 2} r={size / 2} fill={color} />;
  }

  if (shape === "diamond") {
    const inset = 2;
    const center = size / 2;
    return (
      <rect
        x={x + inset}
        y={y + inset}
        width={size - inset * 2}
        height={size - inset * 2}
        rx="2"
        fill={color}
        transform={`rotate(45 ${x + center} ${y + center})`}
      />
    );
  }

  if (shape === "pill") {
    return (
      <rect
        x={x + 2}
        y={y}
        width={size - 4}
        height={size}
        rx={size / 2}
        fill={color}
      />
    );
  }

  return <rect x={x} y={y} width={size} height={size} rx="3" fill={color} />;
}
