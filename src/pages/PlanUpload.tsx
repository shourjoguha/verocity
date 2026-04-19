/** Plan upload — strict markdown parse, AI fallback via edge function, then review. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { parsePlanMarkdown } from "@/lib/planParser";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import type { ParsedPlan } from "@/lib/types";
import { toast } from "sonner";

export default function PlanUpload() {
  const nav = useNavigate();
  const { user } = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [planName, setPlanName] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);

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
      // Fallback
      try {
        const { data, error } = await supabase.functions.invoke("parse-plan", { body: { markdown: text } });
        if (error) throw error;
        const p = (data as { parsed: ParsedPlan }).parsed;
        // Normalize weeks values where AI returned strings -> our parser expects PlannedSet
        // We'll convert when saving.
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
      // If from AI fallback, normalize week-cell strings via local parser to PlannedSet objects.
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

      // Deactivate other plans for this user
      await supabase.from("plans").update({ is_active: false }).eq("owner_user_id", user.id);
      const { data, error } = await supabase.from("plans").insert({
        owner_user_id: user.id,
        name: planName || normalized.title,
        start_date: normalized.startDate ?? null,
        end_date: normalized.endDate ?? null,
        source_markdown: text,
        parsed: normalized as unknown as object,
        is_active: true,
      }).select("id").single();
      if (error) throw error;
      toast.success("Plan saved.");
      nav("/");
    } catch (e) {
      toast.error(`Save failed. ${(e as Error).message ?? ""}`);
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

            <div className="mt-4 flex gap-2">
              <button disabled={!text.trim() || busy} onClick={tryParse} className="ll-btn">
                {busy ? "Parsing..." : "Parse"}
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
    </>
  );
}
