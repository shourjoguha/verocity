/** Library — browse + manage movements (shared + custom). */
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Plus, Trash2 } from "lucide-react";
import { appConfig, type Metric } from "@/config/app.config";
import { LibraryPicker } from "@/components/LibraryPicker";
import { toast } from "sonner";

type Row = {
  id: string; name: string; category: string | null; tags: string[] | null;
  default_metrics: string[] | null; primary_metric: string | null;
  default_rest_seconds: number | null; owner_user_id: string | null;
};

export default function Library() {
  const { user } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | "all">("all");
  const [adding, setAdding] = useState(false);

  async function reload() {
    if (!user) return;
    const { data } = await supabase.from("movements")
      .select("id,name,category,tags,default_metrics,primary_metric,default_rest_seconds,owner_user_id")
      .or(`owner_user_id.is.null,owner_user_id.eq.${user.id}`)
      .order("name");
    setRows((data as Row[]) ?? []);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[], [rows]);
  const filtered = rows.filter((r) =>
    (cat === "all" || r.category === cat) && r.name.toLowerCase().includes(q.toLowerCase())
  );

  async function updateRow(r: Row, patch: Partial<Row>) {
    const isMine = r.owner_user_id === user?.id;
    if (!isMine) { toast.message("Shared movements aren't editable. Add a custom override."); return; }
    const { error } = await supabase.from("movements").update(patch as never).eq("id", r.id);
    if (error) { toast.error("Update failed"); return; }
    reload();
  }
  async function removeRow(r: Row) {
    if (r.owner_user_id !== user?.id) return;
    if (!confirm(`Delete "${r.name}"?`)) return;
    const { error } = await supabase.from("movements").delete().eq("id", r.id);
    if (error) { toast.error("Delete failed"); return; }
    reload();
  }

  return (
    <>
      <TopBar title="Library" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 safe-bottom">
        <div className="flex items-baseline justify-between">
          <EchoHeadline className="text-[2.25rem]">Library</EchoHeadline>
          <button onClick={() => setAdding(true)} className="ll-btn flex items-center gap-1"><Plus className="h-3 w-3" /> Add custom</button>
        </div>

        <div className="mt-6 space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent border-b hairline py-2 focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss" />
          <div className="flex gap-1 overflow-x-auto edge-fade-x">
            <button onClick={() => setCat("all")} className={`shrink-0 text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border ${cat === "all" ? "bg-foreground text-background border-foreground" : "hairline"}`}>all</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`shrink-0 text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border ${cat === c ? "bg-foreground text-background border-foreground" : "hairline"}`}>{c}</button>
            ))}
          </div>
        </div>

        <ul className="mt-4 border-y hairline divide-y hairline">
          {filtered.map((r) => {
            const isMine = r.owner_user_id === user?.id;
            return (
              <li key={r.id} className="px-1 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="font-display text-base tracking-[-0.03em]">{r.name} {isMine && <span className="chip ml-1">mine</span>}</div>
                    <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">{r.category} · {(r.default_metrics ?? []).join(" · ")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Rest</label>
                    <input
                      type="number" min={0} step={5}
                      defaultValue={r.default_rest_seconds ?? 0}
                      onBlur={(e) => updateRow(r, { default_rest_seconds: Math.max(0, Number(e.target.value) || 0) })}
                      disabled={!isMine}
                      className="w-16 bg-transparent border-b hairline font-mono text-xs py-0.5 focus:outline-none focus:border-foreground disabled:opacity-50"
                    />
                    <select
                      defaultValue={r.primary_metric ?? "reps"}
                      onChange={(e) => updateRow(r, { primary_metric: e.target.value })}
                      disabled={!isMine}
                      className="bg-transparent border-b hairline text-xs font-mono py-0.5 focus:outline-none focus:border-foreground disabled:opacity-50"
                    >
                      {appConfig.metrics.list.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {isMine && (
                      <button onClick={() => removeRow(r)} className="p-1 text-muted-foreground hover:text-foreground"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="py-4 text-xs text-muted-foreground uppercase tracking-[0.12em]">No matches</li>}
        </ul>
      </main>

      {adding && user && (
        <LibraryPicker
          ownerId={user.id}
          onClose={() => { setAdding(false); reload(); }}
          onPick={() => { setAdding(false); reload(); }}
        />
      )}
    </>
  );
}
