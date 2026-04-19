/** Gate: global access key. */
import { useState } from "react";
import { useSession } from "@/lib/session";
import { EchoHeadline } from "@/components/EchoHeadline";
import { appConfig } from "@/config/app.config";

export function AccessGate() {
  const { unlock } = useSession();
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const ok = await unlock(val.trim());
    if (!ok) setErr("Invalid key.");
    setBusy(false);
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <EchoHeadline className="text-[3.25rem]">{appConfig.app.name}</EchoHeadline>
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">{appConfig.app.tagline}</p>
        <form onSubmit={submit} className="mt-10 space-y-3">
          <label className="block text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Access key</label>
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            type="password"
            className="w-full bg-transparent border-b hairline py-2 text-lg tracking-[0.1em] focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss"
            placeholder="••••••••"
          />
          {err && <div className="text-xs text-foreground/70">{err}</div>}
          <button disabled={busy || !val} className="ll-btn w-full mt-6">
            {busy ? "Verifying" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
