/** Reusable confirm dialog using shadcn AlertDialog, in Swiss style.
 *  Provides a `useConfirm()` hook that returns an async `confirm()` call. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";

type Opts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Ctx = (opts: Opts) => Promise<boolean>;

const ConfirmContext = createContext<Ctx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Opts>({ title: "" });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Ctx>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  function close(result: boolean) {
    setOpen(false);
    resolverRef.current?.(result);
    resolverRef.current = null;
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) close(false); }}>
        <AlertDialogContent className="border-2 border-foreground rounded-none p-0 max-w-sm">
          <AlertDialogHeader className="p-5 pb-3">
            <AlertDialogTitle className="font-display text-2xl uppercase tracking-[-0.04em]">
              {opts.title}
            </AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {opts.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t hairline p-3 flex-row justify-end gap-2 sm:space-x-0">
            <button
              onClick={() => close(false)}
              className="ll-btn"
            >
              {opts.cancelLabel ?? "Cancel"}
            </button>
            <button
              onClick={() => close(true)}
              className={`ll-btn ${opts.destructive ? "bg-foreground text-background" : ""}`}
            >
              {opts.confirmLabel ?? "Confirm"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
