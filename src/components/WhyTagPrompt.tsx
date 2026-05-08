/** WhyTagPrompt — bottom sheet prompting a single chip explaining a missed/light day. */
import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const CHIPS = ["sick", "busy", "felt off", "deload", "other"] as const;

let resolver: ((v: string | null) => void) | null = null;

/** Promise-based prompter. The component (mounted once) listens for opens. */
export function whyTag(): Promise<string | null> {
  return new Promise((res) => {
    resolver = res;
    window.dispatchEvent(new CustomEvent("whytag:open"));
  });
}

export function WhyTagHost() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const resolved = useRef(false);

  useEffect(() => {
    function onOpen() {
      resolved.current = false;
      setPicked(null);
      setOpen(true);
    }
    window.addEventListener("whytag:open", onOpen as EventListener);
    return () => window.removeEventListener("whytag:open", onOpen as EventListener);
  }, []);

  function close(value: string | null) {
    if (resolved.current) return;
    resolved.current = true;
    setOpen(false);
    if (resolver) { resolver(value); resolver = null; }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) close(null); }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-lg uppercase tracking-[-0.03em]">Why?</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => { setPicked(c); close(c); }}
              className={cn(
                "text-[0.7rem] uppercase tracking-[0.12em] px-3 py-2 border transition-colors",
                picked === c ? "bg-foreground text-background border-foreground" : "hairline hover:bg-secondary",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <DrawerFooter className="flex flex-row justify-end">
          <button onClick={() => close(null)} className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">Skip</button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}