import { cn } from "@/lib/utils";

/**
 * Keeps each score beside its team in both document directions.
 *
 * Fixture layouts keep the semantic DOM order home -> away and mirror under
 * RTL. Rendering a score as one forced-LTR string breaks that relationship, so
 * each side is a separate flex item and follows the surrounding direction.
 */
export function Scoreline({
  home,
  away,
  separator = ":",
  className,
  separatorClassName,
}: {
  home: number | string;
  away: number | string;
  separator?: string;
  className?: string;
  separatorClassName?: string;
}) {
  return (
    <span
      data-numeric
      className={cn("inline-flex items-baseline justify-center tabular-nums", className)}
    >
      <span>{home}</span>
      <span aria-hidden="true" className={separatorClassName}>
        {separator}
      </span>
      <span>{away}</span>
    </span>
  );
}
