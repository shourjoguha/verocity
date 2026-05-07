/** Library picker modal: search shared + custom movements, swap/add. Also adds custom. */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus } from "lucide-react";
import { appConfig, type Metric } from "@/config/app.config";
import { useMovements, qk, type MovementRow as Row } from "@/hooks/queries";
import { toast } from "sonner";

export type PickedMovement = {
  id: string;
  name: string;
  metrics: Metric[];
  primaryMetric: Metric;
  default_rest_seconds: number;
};

export function LibraryPicker(props: { ownerId?: string; onClose: () => void; onPick: (m: PickedMovement) => void }) {
  const { ownerId, onClose, onPick } = props;
  const qc = useQueryClient();
  const { data: rows = [], isError } = useMovements(ownerId);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | "all">("all");
  const [creating, setCreating] = useState(false);

  // Custom create form
  const [name, setName] = useState("");
  const [metrics, setMetrics] = useState<Set<Metric>>(new Set(["weight", "reps", "rpe"]));
  const [primary, setPrimary] = useState<Metric>("weight");
  const [rest, setRest] = useState(90);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[], [rows]);
  const filtered = rows.filter((r) =>
    (cat === "all" || r.category === cat) && r.name.toLowerCase().includes(q.toLowerCase())
  );

  function pick(r: Row) {
    onPick({
      id: r.id,
      name: r.name,
      metrics: (r.default_metrics ?? ["reps"]) as Metric[],
      primaryMetric: ((r.primary_metric as Metric) ?? "reps"),
      default_rest_seconds: r.default_rest_seconds ?? 90,
    });
  }

  async function createCustom() {
    if (!name.trim() || !ownerId) return;
    const { data, error } = await supabase.from("movements").insert([{
      name: name.trim(),
      owner_user_id: ownerId,
      category: "custom",
      tags: [],
      default_metrics: Array.from(metrics),
      primary_metric: primary,
      default_rest_seconds: rest,
    }]).select("*").single();
    if (error || !data) { toast.error("Create failed"); return; }
    qc.invalidateQueries({ queryKey: qk.movements(ownerId) });
    pick(data as Row);
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex items-start justify-center p-4 sm:p-10">
      <div className="w-full max-w-lg border hairline bg-surface flex flex-col max-h-[90dvh]">
        <header className="flex items-center justify-between p-3 border-b hairline">
          <h3 className="font-display text-xl uppercase tracking-[-0.03em]">{creating ? "New movement" : "Library"}</h3>
          <button onClick={onClose} className="p-1"><X className="h-4 w-4" /></button>
        </header>

        {!creating && (
          <>
            <div className="p-3 border-b hairline space-y-2">
              {isError && <div className="text-xs text-destructive">Failed to load movements.</div>}
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full bg-transparent border-b hairline py-2 focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss"
              />
              <div className="flex gap-1 overflow-x-auto edge-fade-x">
                <button onClick={() => setCat("all")} className={`shrink-0 text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border ${cat === "all" ? "bg-foreground text-background border-foreground" : "hairline"}`}>all</button>
                {categories.map((c) => (
                  <button key={c} onClick={() => setCat(c)} className={`shrink-0 text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border ${cat === c ? "bg-foreground text-background border-foreground" : "hairline"}`}>{c}</button>
                ))}
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y hairline">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button onClick={() => pick(r)} className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors duration-slow ease-swiss">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-base tracking-[-0.03em]">{r.name}</span>
                      <span className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">{r.category}</span>
                    </div>
                    <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">
                      {(r.default_metrics ?? []).join(" · ")} · primary {r.primary_metric}
                    </div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="p-4 text-xs text-muted-foreground uppercase tracking-[0.12em]">No matches</li>}
            </ul>
            <footer className="border-t hairline p-3 flex justify-between items-center">
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">{filtered.length} movements</span>
              <button onClick={() => setCreating(true)} className="ll-btn flex items-center gap-1"><Plus className="h-3 w-3" /> Add custom</button>
            </footer>
          </>
        )}

        {creating && (
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent border-b hairline py-2 focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss" />
            </div>
            <div>
              <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">Metrics</label>
              <div className="flex flex-wrap gap-1">
                {appConfig.metrics.list.map((m) => {
                  const on = metrics.has(m);
                  return (
                    <button key={m} onClick={() => {
                      const n = new Set(metrics);
                      if (on) n.delete(m); else n.add(m);
                      setMetrics(n);
                    }} className={`text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border ${on ? "bg-foreground text-background border-foreground" : "hairline"}`}>{m}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">Primary</label>
              <div className="flex flex-wrap gap-1">
                {Array.from(metrics).map((m) => (
                  <button key={m} onClick={() => setPrimary(m)} className={`text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border ${primary === m ? "bg-foreground text-background border-foreground" : "hairline"}`}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">Default rest (s)</label>
              <input type="number" min={0} step={5} value={rest} onChange={(e) => setRest(Math.max(0, Number(e.target.value) || 0))} className="w-32 bg-transparent border-b hairline py-1 font-mono focus:outline-none focus:border-foreground" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="ll-btn">Back</button>
              <button onClick={createCustom} disabled={!name.trim() || metrics.size === 0} className="ll-btn">Create + use</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
