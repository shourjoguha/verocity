/** SnoozeDrawer — bottom-sheet picker for 1–7 day snooze. */
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export function SnoozeDrawer({
  open,
  onOpenChange,
  onPick,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (days: number) => void;
  submitting?: boolean;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={false}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl uppercase tracking-[-0.04em]">Snooze until</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <div className="grid grid-cols-7 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                disabled={submitting}
                onClick={() => onPick(d)}
                className={cn(
                  "border hairline py-3 font-mono text-sm hover:bg-secondary transition-colors duration-slow ease-swiss",
                  submitting && "opacity-40 cursor-not-allowed",
                )}
              >
                +{d}d
              </button>
            ))}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="mt-4 w-full text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Cancel
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}