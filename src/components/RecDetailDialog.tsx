/** RecDetailDialog — full markdown body + disposition controls. */
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SnoozeDrawer } from "@/components/SnoozeDrawer";
import { cn } from "@/lib/utils";
import {
  useRecommendation,
  useDispositionRec,
  useSnoozeRec,
  useRecentDoneLogs,
  type RecommendationRow,
} from "@/hooks/queries";

type Disposition = "acted_as_prescribed" | "acted_modified" | "skipped";

function relTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function DomainBadge({ domain }: { domain: string }) {
  return (
    <span className="border hairline px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] font-mono bg-foreground/5">
      {domain}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const isDismissed = status === "dismissed";
  return (
    <span
      className={cn(
        "border hairline px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] font-mono",
        status === "acted" && "bg-foreground text-background border-foreground",
        status === "open" && "bg-foreground/10",
        status === "snoozed" && "bg-muted text-muted-foreground",
        isDismissed && "text-muted-foreground line-through",
      )}
    >
      {status}
    </span>
  );
}

export function RecDetailDialog({
  recSummary,
  userId,
  open,
  onClose,
}: {
  recSummary: RecommendationRow | null;
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const recQ = useRecommendation(recSummary?.id, userId);
  const rec = recQ.data ?? null;
  const disposeMut = useDispositionRec();
  const snoozeMut = useSnoozeRec();

  const [fit, setFit] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [linkedWorkout, setLinkedWorkout] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  // Reset form when a new rec is opened
  useEffect(() => {
    if (open) {
      setFit(null);
      setNote("");
      setLinkedWorkout(null);
      setSnoozeOpen(false);
    }
  }, [recSummary?.id, open]);

  const sessionsQ = useRecentDoneLogs(rec?.domain === "fitness" ? userId : null, 20);

  const acted = !!rec?.acted_at;
  const submitting = disposeMut.isPending || snoozeMut.isPending;

  async function commit(disposition: Disposition) {
    if (!rec) return;
    const status: "acted" | "dismissed" = disposition === "skipped" ? "dismissed" : "acted";
    const prevSnoozeCount = rec.snooze_count ?? 0;
    try {
      await disposeMut.mutateAsync({
        recId: rec.id,
        userId,
        status,
        acted_disposition: disposition,
        subjective_fit_1_5: fit,
        next_session_id: linkedWorkout,
        outcome_note: note.trim() ? note.trim().slice(0, 280) : null,
        prevSnoozeCount,
      });
      toast.success("Rec dispositioned");
      if (prevSnoozeCount >= 2) {
        toast("Forced-decision flag was set — good call acting on it");
      }
      onClose();
    } catch (e) {
      toast.error("Failed to disposition", { description: (e as Error).message });
    }
  }

  async function commitSnooze(days: number) {
    if (!rec) return;
    try {
      await snoozeMut.mutateAsync({
        recId: rec.id,
        userId,
        days,
        prevSnoozeCount: rec.snooze_count ?? 0,
      });
      toast.success(`Snoozed ${days}d`);
      setSnoozeOpen(false);
      onClose();
    } catch (e) {
      toast.error("Snooze failed", { description: (e as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {recQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {rec && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <DomainBadge domain={rec.domain} />
                <code className="text-[0.65rem] text-muted-foreground font-mono">{rec.id.slice(0, 8)}</code>
                <span className="text-[0.65rem] text-muted-foreground font-mono">{relTime(rec.created_at)}</span>
                <StatusChip status={rec.status} />
              </DialogTitle>
            </DialogHeader>

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {rec.body_md ? (
                <ReactMarkdown>{rec.body_md}</ReactMarkdown>
              ) : (
                <>
                  <h3>TL;DR</h3>
                  <p>{rec.tldr}</p>
                </>
              )}
            </div>

            <div className="border-t hairline pt-3">
              <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground mb-1">{">"} Action</div>
              <div className="font-display text-base tracking-[-0.02em]">{rec.action}</div>
            </div>

            <details className="border hairline">
              <summary className="px-3 py-2 text-[0.6rem] uppercase tracking-[0.14em] cursor-pointer hover:bg-secondary">
                Frontmatter
              </summary>
              <div className="px-3 pb-3 pt-1 text-[0.7rem]">
                <table className="w-full">
                  <tbody className="font-mono">
                    <FmRow k="drift_score" v={rec.drift_score != null ? rec.drift_score.toFixed(3) : "—"} />
                    <FmRow k="confidence" v={`${rec.confidence}%`} />
                    <FmRow k="block_week" v={rec.block_week != null ? String(rec.block_week) : "—"} />
                    <FmRow k="goal_ref" v={rec.goal_ref} />
                    <FmRow k="trigger_type" v={rec.trigger_type} />
                  </tbody>
                </table>
                <div className="mt-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">signals_fired</div>
                  <SignalsList signals={rec.signals_fired} />
                </div>
                <div className="mt-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">source_refs</div>
                  <SourceList refs={rec.source_refs} />
                </div>
                {rec.rx_md_path && (
                  <div className="mt-3 text-[0.65rem] text-muted-foreground font-mono break-all">
                    path: {rec.rx_md_path}
                  </div>
                )}
              </div>
            </details>

            {acted ? (
              <div className="border-t hairline pt-3 text-xs text-muted-foreground">
                Dispositioned {relTime(rec.acted_at)} —{" "}
                <span className="font-mono">{rec.acted_disposition}</span>
                {rec.subjective_fit_1_5 != null && (
                  <span className="ml-2 font-mono">fit {rec.subjective_fit_1_5}/5</span>
                )}
                {rec.outcome_note && <div className="mt-2 italic">"{rec.outcome_note}"</div>}
              </div>
            ) : (
              <div className="border-t hairline pt-4 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2">
                  <DispoBtn label="Acted as prescribed" disabled={submitting} onClick={() => commit("acted_as_prescribed")} primary />
                  <DispoBtn label="Acted modified" disabled={submitting} onClick={() => commit("acted_modified")} primary />
                  <DispoBtn label="Skipped" disabled={submitting} onClick={() => commit("skipped")} />
                  <DispoBtn label="Snooze" disabled={submitting} onClick={() => setSnoozeOpen(true)} />
                </div>

                <div>
                  <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">
                    How well did this fit? <span className="opacity-60">(1 = horoscope, 5 = spot-on)</span>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const on = fit === n;
                      return (
                        <button
                          key={n}
                          onClick={() => setFit((cur) => (cur === n ? null : n))}
                          className={cn(
                            "h-9 w-9 border hairline font-mono text-sm transition-colors",
                            on ? "bg-foreground text-background border-foreground" : "hover:bg-secondary",
                          )}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {rec.domain === "fitness" && (
                  <div>
                    <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">
                      Linked workout <span className="opacity-60">(optional)</span>
                    </div>
                    <Select
                      value={linkedWorkout ?? "__none"}
                      onValueChange={(v) => setLinkedWorkout(v === "__none" ? null : v)}
                    >
                      <SelectTrigger className="font-mono text-sm">
                        <SelectValue placeholder="— none —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— none —</SelectItem>
                        {(sessionsQ.data ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id} className="font-mono">
                            {s.log_date} · {s.day_key ?? "—"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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

            <SnoozeDrawer
              open={snoozeOpen}
              onOpenChange={setSnoozeOpen}
              onPick={commitSnooze}
              submitting={submitting}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DispoBtn({ label, onClick, disabled, primary }: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border hairline px-3 py-3 text-sm uppercase tracking-[0.08em] transition-colors duration-slow ease-swiss",
        primary ? "bg-foreground text-background border-foreground hover:bg-foreground/90" : "hover:bg-secondary",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {label}
    </button>
  );
}

function FmRow({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b hairline/50">
      <td className="text-muted-foreground py-1 pr-3 text-[0.6rem] uppercase tracking-[0.14em]">{k}</td>
      <td className="py-1 break-all">{v}</td>
    </tr>
  );
}

function SignalsList({ signals }: { signals: unknown }) {
  if (!signals || typeof signals !== "object") {
    return <div className="text-muted-foreground italic">none</div>;
  }
  const entries = Array.isArray(signals)
    ? signals.map((s, i) => [String(i), s] as const)
    : Object.entries(signals as Record<string, unknown>);
  if (entries.length === 0) return <div className="text-muted-foreground italic">none</div>;
  return (
    <ul className="space-y-0.5">
      {entries.map(([k, v]) => (
        <li key={k} className="font-mono text-[0.65rem]">
          <span className="text-muted-foreground">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </li>
      ))}
    </ul>
  );
}

function SourceList({ refs }: { refs: unknown }) {
  const arr = Array.isArray(refs) ? refs : refs && typeof refs === "object" ? Object.values(refs as object) : [];
  if (arr.length === 0) return <div className="text-muted-foreground italic">none</div>;
  return (
    <ul className="list-disc list-inside space-y-0.5">
      {arr.map((r, i) => (
        <li key={i} className="font-mono text-[0.65rem] break-all">
          {typeof r === "object" ? JSON.stringify(r) : String(r)}
        </li>
      ))}
    </ul>
  );
}