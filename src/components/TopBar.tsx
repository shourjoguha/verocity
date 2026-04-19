/** Persistent top bar with back, home, and user. */
import { ArrowLeft, Home as HomeIcon } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSession } from "@/lib/session";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TopBar({ title }: { title?: string }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, signOut, switchUser } = useSession();
  const isHome = loc.pathname === "/" || loc.pathname === "/home";

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b hairline">
      <div className="mx-auto max-w-3xl flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-1">
          <button
            aria-label="Back"
            onClick={() => nav(-1)}
            disabled={isHome}
            className="p-2 transition-colors duration-slow ease-swiss disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Home"
            onClick={() => nav("/")}
            className="p-2 transition-colors duration-slow ease-swiss"
          >
            <HomeIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="font-display text-sm tracking-[-0.04em] uppercase">{title ?? "LIFTLOG"}</div>
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-[0.65rem] uppercase tracking-[0.12em] font-bold px-2 py-1 border hairline">
              {user?.display_name ?? "—"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-0">
            <button
              onClick={switchUser}
              className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary"
            >
              Switch user
            </button>
            <div className="border-t hairline" />
            <button
              onClick={signOut}
              className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary"
            >
              Sign out
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
