/** Recommendations queue + disposition UI (Phase U + V). */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import { toast } from "@/hooks/use-toast";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Domain = "fitness" | "finance" | "nutrition";
type Status = "open" | "snoozed" | "acted" | "dismissed";
type Disposition = "acted_as_prescribed" | "acted_modified" | "skipped" | "obsolete";

interface Rec {
  id: string;
  owner_user_id: string;
  domain: Domain | string;
  created_at: string;
  tldr: string;
  action: string;
  body_md: string | null;
  drift_score: number | null;
  confidence: number;
  status: Status | string;
  acted_disposition: string | null;
  acted_at: string | null;
  subjective_fit_1_5: number | null;
  next_session_id: string | null;
  outcome_note: string | null;
  snoozed_until: string | null;
  snooze_count: number;
  rx_md_path: string;
  goal_ref: string;
  block_week: number | null;
  trigger_type: string;
  signals_fired: unknown;
  source_refs: unknown;
}

const DOMAIN_COLORS: Record<string, string> = {
  fitness: "bg-[hsl(140_60%_45%)] text-white",
  finance: "bg-[hsl(220_70%_55%)] text-white",
  nutrition: "bg-[hsl(30_85%_55%)] text-white",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-[hsl(45_95%_55%)] text-black",
  snoozed: "bg-[hsl(210_70%_55%)] text-white",
  acted: "bg-[hsl(140_60%_45%)] text-white",
  dismissed: "bg-muted text-muted-foreground",
};

function relTime(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return iso; }
}

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function reviveIn(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${d}d ${h}h`;
}

function statusRank(s: string): number {
  return s === "open" ? 1 : s === "snoozed" ? 2 : 3;
}

export default function Recommendations() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [domain, setDomain] = useState<"all" | Domain>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const recsQ = useQuery({
    queryKey: ["recommendations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("recommendations")
        .select("*")
        .eq("owner_user_id", user!.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Rec[];
    },
  });

  const filtered = useMemo(() => {
    const list = (recsQ.data ?? []).filter((r) => domain === "all" || r.domain === domain);
    return [...list].sort((a, b) => {
      const r = statusRank(a.status) - statusRank(b.status);
      if (r !== 0) return r;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [recsQ.data, domain]);

  const openRec = useMemo(
    () => (recsQ.data ?? []).find((r) => r.id === openId) ?? null,
    [recsQ.data, openId],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["recommendations", user?.id] });

  return (
    <>
      <TopBar title="RECS" />
      <main className="mx-auto max-w-3xl px-3 sm:px-4 pt-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl uppercase tracking-[-0.04em]">Recommendations</h1>
          <button
            onClick={refresh}
            className="text-[0.6rem] uppercase tracking-[0.14em] font-bold px-3 py-1 border hairline hover:bg-secondary"
          >
            Refresh
          </button>
        </div>

        <div className="flex gap-1 mb-4 border hairline p-1 w-fit">
          {(["all", "fitness", "finance", "nutrition"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={cn(
                "text-[0.6rem] uppercase tracking-[0.14em] font-bold px-3 py-1.5 transition-colors",
                domain === d ? "bg-foreground text-background" : "hover:bg-secondary",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        {recsQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {recsQ.isError && <div className="text-sm text-destructive">Failed to load recommendations.</div>}
        {!recsQ.isLoading && filtered.length === 0 && (
          <div className="text-sm text-muted-foreground border hairline p-6 text-center">
            No recommendations in the last 60 days.
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {filtered.map((r) => {
            const age = ageDays(r.created_at);
            const forced = (r.snooze_count ?? 0) >= 2;
            const revive = reviveIn(r.snoozed_until);
            return (
              <li key={r.id}>
                <button
                  onClick={() => setOpenId(r.id)}
                  className="w-full text-left border hairline p-3 hover:bg-secondary/40 transition-colors"
                >
                  {forced && (
                    <div className="text-[0.6rem] uppercase tracking-[0.14em] font-bold text-destructive mb-1.5">
                      Forced decision — snoozed {r.snooze_count}×
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn("text-[0.6rem] uppercase tracking-[0.12em]", DOMAIN_COLORS[r.domain] ?? "bg-secondary")}>
                      {r.domain}
                    </Badge>
                    <Badge className={cn("text-[0.6rem] uppercase tracking-[0.12em]", STATUS_COLORS[r.status] ?? "bg-secondary")}>
                      {r.status}
                      {r.status === "snoozed" && revive ? ` · ${revive}` : ""}
                    </Badge>
                    <code className="text-[0.65rem] text-muted-foreground font-mono">{r.id.slice(0, 8)}</code>
                    <span className="text-[0.65rem] text-muted-foreground">{relTime(r.created_at)}</span>
                    {age > 14 && (
                      <span className="text-[0.6rem] uppercase tracking-[0.14em] font-bold text-destructive">
                        aging {age}d
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-sm line-clamp-2">{r.tldr.slice(0, 100)}{r.tldr.length > 100 ? "…" : ""}</div>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground">drift</div>
                      <div className="h-1.5 bg-secondary mt-0.5">
                        <div
                          className="h-full bg-foreground"
                          style={{ width: `${Math.round((r.drift_score ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground">conf</div>
                      <div className="font-mono text-xs">{r.confidence}</div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      <RecDetailDialog
        rec={openRec}
        onClose={() => setOpenId(null)}
        onDispositioned={refresh}
      />
    </>
  );
}

/* ---------------- Detail + Disposition ---------------- */

function RecDetailDialog({
  rec,
  onClose,
  onDispositioned,
}: {
  rec: Rec | null;
  onClose: () => void;
  onDispositioned: () => void;
}) {
  const [fit, setFit] = useState<number>(3);
  const [note, setNote] = useState("");
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeDays, setSnoozeDays] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [nextSessionId, setNextSessionId] = useState<string | null>(null);

  const open = rec !== null;
  const locked = !!rec && rec.status !== "open" && rec.status !== "snoozed";

  const disposition = useMutation({
    mutationFn: async (args: {
      status: "acted" | "dismissed";
      acted_disposition: Disposition;
      requireFit: boolean;
    }) => {
      if (!rec) throw new Error("no rec");
      const { error } = await supabase
        .from("recommendations")
        .update({
          status: args.status,
          acted_disposition: args.acted_disposition,
          acted_at: new Date().toISOString(),
          subjective_fit_1_5: args.requireFit ? fit : fit,
          next_session_id: nextSessionId,
          outcome_note: note.trim() ? note.trim().slice(0, 280) : null,
        })
        .eq("id", rec.id)
        .is("acted_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Rec dispositioned", description: "Your next /rx-* run will see this." });
      onDispositioned();
      handleClose();
    },
    onError: (e: unknown) => {
      toast({ title: "Failed to disposition", description: String((e as Error).message ?? e), variant: "destructive" });
    },
    onSettled: () => setSubmitting(false),
  });

  const snooze = useMutation({
    mutationFn: async () => {
      if (!rec) throw new Error("no rec");
      const days = Math.min(Math.max(snoozeDays, 1), 7);
      const until = new Date(Date.now() + days * 86_400_000).toISOString();
      const { error } = await supabase
        .from("recommendations")
        .update({
          status: "snoozed",
          snoozed_until: until,
          snooze_count: (rec.snooze_count ?? 0) + 1,
        })
        .eq("id", rec.id);
      if (error) throw error;
      return (rec.snooze_count ?? 0) + 1;
    },
    onSuccess: (newCount) => {
      if (newCount >= 2) {
        toast({
          title: "Forced-decision flag set",
          description: "Consider acting or dismissing next time.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Snoozed", description: `Will revive in ${snoozeDays} day${snoozeDays > 1 ? "s" : ""}.` });
      }
      onDispositioned();
      setSnoozeOpen(false);
      handleClose();
    },
    onError: (e: unknown) => {
      toast({ title: "Snooze failed", description: String((e as Error).message ?? e), variant: "destructive" });
    },
    onSettled: () => setSubmitting(false),
  });

  function handleClose() {
    setFit(3);
    setNote("");
    setNextSessionId(null);
    setSnoozeDays(2);
    setSnoozeOpen(false);
    onClose();
  }

  function act(disp: Disposition) {
    if (!rec) return;
    if (locked) {
      toast({ title: "Already dispositioned", description: "Decisions are append-only.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const status: "acted" | "dismissed" = disp === "skipped" || disp === "obsolete" ? "dismissed" : "acted";
    const requireFit = status === "acted";
    disposition.mutate({ status, acted_disposition: disp, requireFit });
  }

  const frontmatter = rec
    ? {
        id: rec.id,
        domain: rec.domain,
        goal_ref: rec.goal_ref,
        trigger_type: rec.trigger_type,
        block_week: rec.block_week,
        drift_score: rec.drift_score,
        confidence: rec.confidence,
        signals_fired: rec.signals_fired,
        source_refs: rec.source_refs,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {rec && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <Badge className={cn("text-[0.6rem] uppercase tracking-[0.12em]", DOMAIN_COLORS[rec.domain] ?? "bg-secondary")}>
                  {rec.domain}
                </Badge>
                <Badge className={cn("text-[0.6rem] uppercase tracking-[0.12em]", STATUS_COLORS[rec.status] ?? "bg-secondary")}>
                  {rec.status}
                </Badge>
                <code className="text-xs text-muted-foreground font-mono">{rec.id.slice(0, 8)}</code>
              </DialogTitle>
            </DialogHeader>

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {rec.body_md ? (
                <ReactMarkdown>{rec.body_md}</ReactMarkdown>
              ) : (
                <>
                  <h3>TL;DR</h3>
                  <p>{rec.tldr}</p>
                  <h3>Action</h3>
                  <p>{rec.action}</p>
                  <p className="text-xs text-muted-foreground italic">No body_md attached.</p>
                </>
              )}
            </div>

            <Collapsible>
              <CollapsibleTrigger className="text-[0.6rem] uppercase tracking-[0.14em] font-bold px-2 py-1 border hairline hover:bg-secondary">
                Frontmatter
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="text-[0.65rem] bg-secondary p-3 overflow-auto font-mono">
                  {JSON.stringify(frontmatter, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            {rec.rx_md_path && (
              <div className="text-[0.65rem]">
                <span className="uppercase tracking-[0.14em] text-muted-foreground mr-2">Source</span>
                <a
                  href={rec.rx_md_path}
                  className="font-mono underline break-all"
                  target="_blank"
                  rel="noreferrer"
                >
                  {rec.rx_md_path}
                </a>
              </div>
            )}

            {!locked && (
              <div className="border-t hairline pt-4 mt-2 flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Button
                    className="bg-[hsl(140_60%_40%)] hover:bg-[hsl(140_60%_35%)] text-white"
                    disabled={submitting}
                    onClick={() => act("acted_as_prescribed")}
                  >
                    Acted (Rx)
                  </Button>
                  <Button
                    className="bg-[hsl(140_50%_50%)] hover:bg-[hsl(140_50%_45%)] text-white"
                    disabled={submitting}
                    onClick={() => act("acted_modified")}
                  >
                    Acted (mod)
                  </Button>
                  <Button variant="secondary" disabled={submitting} onClick={() => act("skipped")}>
                    Skipped
                  </Button>
                  <Button
                    className="bg-[hsl(210_70%_50%)] hover:bg-[hsl(210_70%_45%)] text-white"
                    disabled={submitting}
                    onClick={() => setSnoozeOpen(true)}
                  >
                    Snooze
                  </Button>
                </div>

                <div>
                  <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">
                    Subjective fit — {fit}/5 <span className="opacity-60">(required if acted)</span>
                  </div>
                  <Slider min={1} max={5} step={1} value={[fit]} onValueChange={(v) => setFit(v[0] ?? 3)} />
                </div>

                {rec.domain === "fitness" && (
                  <LinkedSessionPicker userId={rec.owner_user_id} value={nextSessionId} onChange={setNextSessionId} />
                )}

                <div>
                  <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">
                    Outcome note <span className="opacity-60">({note.length}/280)</span>
                  </div>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 280))}
                    placeholder="Optional…"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {locked && (
              <div className="border-t hairline pt-4 mt-2 text-xs text-muted-foreground">
                Dispositioned {rec.acted_at ? relTime(rec.acted_at) : ""} ·{" "}
                <span className="font-mono">{rec.acted_disposition}</span>
                {rec.outcome_note && <div className="mt-2 italic">"{rec.outcome_note}"</div>}
              </div>
            )}

            <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Snooze for how long?</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <div className="text-center font-display text-3xl mb-4">
                    {snoozeDays} day{snoozeDays > 1 ? "s" : ""}
                  </div>
                  <Slider min={1} max={7} step={1} value={[snoozeDays]} onValueChange={(v) => setSnoozeDays(v[0] ?? 2)} />
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setSnoozeOpen(false)}>Cancel</Button>
                  <Button
                    disabled={submitting}
                    onClick={() => { setSubmitting(true); snooze.mutate(); }}
                  >
                    Confirm
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Linked session picker (fitness) ---------------- */

function LinkedSessionPicker({
  userId,
  value,
  onChange,
}: {
  userId: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const sessionsQ = useQuery({
    queryKey: ["recent-workout-logs", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id,log_date,day_key,activity_type,status")
        .eq("owner_user_id", userId)
        .order("log_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">
        Linked workout <span className="opacity-60">(optional)</span>
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full text-sm border hairline bg-background px-2 py-2"
      >
        <option value="">— none —</option>
        {(sessionsQ.data ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.log_date} · {s.day_key ?? s.activity_type} · {s.status}
          </option>
        ))}
      </select>
    </div>
  );
}