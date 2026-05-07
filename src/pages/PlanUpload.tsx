/** Plan upload — strict markdown parse, AI fallback via edge function, then review. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { parsePlanMarkdown } from "@/lib/planParser";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import type { ParsedPlan } from "@/lib/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdoptablePlans, qk, type AdoptablePlan } from "@/hooks/queries";

const FORMAT_EXAMPLE = `# Plan title
**Start:** 2026-01-01
**End:** 2026-04-22
**Goal:** Hypertrophy + conditioning

## Block Structure
| Block | Weeks | Focus |
| --- | --- | --- |
| Accumulation | 1-4 | Volume |

## Weekly Template
| Day | Type | Focus | Conditioning |
| --- | --- | --- | --- |
| Monday | Lower A | Squat | — |
| Tuesday | Upper A | Bench | — |

## 16-Week Progression by Day
### MONDAY — Lower A
| Block | Exercise | W1 | W2 | W3 | W4 |
| --- | --- | --- | --- | --- | --- |
| Main | Back Squat | 3x5 @70% | 3x5 @72.5% | 3x5 @75% | deload |
`;

export default function PlanUpload() {
  const nav = useNavigate();
  const { user } = useSession();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [planName, setPlanName] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);

  const [adoptOpen, setAdoptOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const adoptQ = useAdoptablePlans(user?.id, { enabled: adoptOpen });
  const adoptList = adoptQ.data ?? [];
  const adoptLoading = adoptQ.isLoading;

  async function onFile(f: File) {
    const t = await f.text();
    setText(t);
    setPlanName((p) => p || f.name.replace(/\.[^.]+$/, ""));
  }

  async function tryParse() {
    setBusy(true);
    setUsedFallback(false);
    try {
      const p = parsePlanMarkdown(text);
      setParsed(p);
      if (!planName) setPlanName(p.title);
      toast.success("Parsed locally.");
    } catch (e) {
      try {
        const { data, error } = await supabase.functions.invoke("parse-plan", { body: { markdown: text } });
        if (error) throw error;
        const p = (data as { parsed: ParsedPlan }).parsed;
        setParsed(p);
        setUsedFallback(true);
        if (!planName) setPlanName(p.title);
        toast.success("Parsed via AI fallback.");
      } catch (e2) {
        toast.error(`Parse failed. ${(e2 as Error).message ?? ""}`);
      }
    }
    setBusy(false);
  }

  async function save() {
    if (!parsed || !user) return;
    setBusy(true);
    try {
      let normalized = parsed;
      if (usedFallback) {
        const { parsePlannedCell } = await import("@/lib/planParser");
        normalized = {
          ...parsed,
          days: parsed.days.map((d) => ({
            ...d,
            exercises: d.exercises.map((ex) => {
              const weeks: Record<number, ReturnType<typeof parsePlannedCell>> = {};
              const raw = (ex as unknown as { weeks: Record<string, string | null> }).weeks ?? {};
              for (const [k, v] of Object.entries(raw)) {
                weeks[parseInt(k, 10)] = v ? parsePlannedCell(v) : null;
              }
              return { ...ex, weeks } as typeof ex;
            }),
          })),
        };
      }

      await supabase.from("plans").update({ is_active: false }).eq("owner_user_id", user.id);
      const { error } = await supabase.from("plans").insert([{
        owner_user_id: user.id,
        name: planName || normalized.title,
        start_date: normalized.startDate ?? null,
        end_date: normalized.endDate ?? null,
        source_markdown: text,
        parsed: normalized as never,
        is_active: true,
      }]).select("id").single();
      if (error) throw error;
      toast.success("Plan saved.");
      if (user) qc.invalidateQueries({ queryKey: qk.activePlan(user.id) });
      nav("/");
    } catch (e) {
      toast.error(`Save failed. ${(e as Error).message ?? ""}`);
    }
    setBusy(false);
  }

  async function adoptPlan(src: AdoptablePlan) {
    if (!user) return;
    setBusy(true);
    try {
      await supabase.from("plans").update({ is_active: false }).eq("owner_user_id", user.id);
      const { error } = await supabase.from("plans").insert([{
        owner_user_id: user.id,
        name: src.name,
        start_date: src.start_date,
        end_date: src.end_date,
        source_markdown: src.source_markdown,
        parsed: src.parsed as never,
        is_active: true,
      }]).select("id").single();
      if (error) throw error;
      toast.success(`Adopted "${src.name}".`);
      qc.invalidateQueries({ queryKey: qk.activePlan(user.id) });
      setAdoptOpen(false);
      nav("/");
    } catch (e) {
      toast.error(`Adopt failed. ${(e as Error).message ?? ""}`);
    }
    setBusy(false);
  }

  return (
    <>
      <TopBar title="Upload plan" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <EchoHeadline className="text-[2.25rem]">Upload plan</EchoHeadline>
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Markdown file or paste text</p>

        {!parsed && (
          <>
            <div className="mt-6 flex items-center gap-3">
              <label className="ll-btn cursor-pointer">
                Choose file
                <input
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
              </label>
              <input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Plan name"
                className="flex-1 bg-transparent border-b hairline py-2 text-sm focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss"
              />
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder="Or paste markdown here..."
              className="mt-4 w-full h-72 bg-surface border hairline p-3 font-mono text-xs leading-5 focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss"
            />

            {!text.trim() && (
              <details className="mt-3 border hairline">
                <summary className="cursor-pointer px-3 py-2 text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss select-none">
                  See expected format
                </summary>
                <pre className="px-3 pb-3 pt-1 font-mono text-[0.7rem] leading-5 overflow-x-auto text-muted-foreground whitespace-pre">{FORMAT_EXAMPLE}</pre>
              </details>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
              <button disabled={!text.trim() || busy} onClick={tryParse} className="ll-btn">
                {busy ? "Parsing..." : "Parse"}
              </button>
              <button onClick={() => setAdoptOpen(true)} className="ll-btn">
                Adopt existing plan
              </button>
            </div>
          </>
        )}

        {parsed && (
          <section className="mt-8 border hairline p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">Detected{usedFallback ? " · AI" : ""}</div>
                <h2 className="font-display text-2xl tracking-[-0.04em] mt-1">{parsed.title}</h2>
                <div className="text-xs text-muted-foreground mt-1">
                  {parsed.startDate ?? "—"} → {parsed.endDate ?? "—"} · {parsed.days.length} days · {parsed.blocks.length} blocks
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setParsed(null)} className="ll-btn">Edit</button>
                <button onClick={save} disabled={busy} className="ll-btn">Save plan</button>
              </div>
            </div>
            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              {parsed.days.map((d) => (
                <div key={d.dayName} className="border hairline p-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">{d.dayName}</div>
                  <div className="font-display text-lg tracking-[-0.03em]">{d.type}</div>
                  <ul className="mt-2 text-xs space-y-1">
                    {d.exercises.map((ex, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{ex.name}</span>
                        <span className="text-muted-foreground font-mono">{ex.primaryMetric}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <Dialog open={adoptOpen} onOpenChange={setAdoptOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-[-0.03em]">Adopt an existing plan</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto -mx-6 px-6">
            {adoptLoading && <div className="text-xs text-muted-foreground py-6">Loading…</div>}
            {adoptQ.isError && <div className="text-xs text-destructive py-6">Failed to load plans.</div>}
            {!adoptLoading && adoptList.length === 0 && (
              <div className="text-xs text-muted-foreground py-6 uppercase tracking-[0.14em]">No plans available to adopt</div>
            )}
            <ul className="divide-y hairline border-y hairline">
              {adoptList.map((p) => {
                const expanded = expandedId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                      className="w-full flex items-baseline justify-between gap-3 py-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss px-1"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base tracking-[-0.03em] truncate">{p.name}</div>
                        <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">
                          by {p.ownerName} · {p.parsed?.days?.length ?? 0} days · {p.start_date ?? "—"} → {p.end_date ?? "—"}
                        </div>
                      </div>
                      <span className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground shrink-0">
                        {expanded ? "Hide" : "View"}
                      </span>
                    </button>
                    {expanded && (
                      <div className="pb-4 px-1 animate-fade-in">
                        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto border hairline p-2">
                          {(p.parsed?.days ?? []).map((d) => (
                            <div key={d.dayName} className="border hairline p-2">
                              <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground">{d.dayName}</div>
                              <div className="font-display text-sm tracking-[-0.03em] truncate">{d.type}</div>
                              <div className="text-[0.65rem] text-muted-foreground mt-0.5">{d.exercises.length} movements</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button onClick={() => adoptPlan(p)} disabled={busy} className="ll-btn">
                            Adopt this plan
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
