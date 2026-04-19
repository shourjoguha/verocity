/** Echo-effect headline. Layered repetitions behind primary text. */
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  layers?: 4 | 5;
  as?: "h1" | "h2" | "h3" | "div";
}

export function EchoHeadline({ children, className, layers = 4, as: Tag = "h1" }: Props) {
  // Offsets in em on x-axis create the staggered echo
  const offsets = [0.04, 0.08, 0.12, 0.16];
  const colors = ["text-echo-1", "text-echo-2", "text-echo-3", "text-echo-4"];
  return (
    <Tag className={cn("echo-headline", className)} aria-label={typeof children === "string" ? children : undefined}>
      {offsets.slice(0, layers).map((o, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("echo-layer", colors[i])}
          style={{ transform: `translateX(-${o}em)` }}
        >
          {children}
        </span>
      ))}
      <span className="echo-content">{children}</span>
    </Tag>
  );
}
