/** Recommendations list — Open / Snoozed / Recent decisions. */
import { useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { RecDetailDialog } from "@/components/RecDetailDialog";
import { useSession } from "@/lib/session";
import { useRecommendations, type RecommendationRow } from "@/hooks/queries";
import { cn } from "@/lib/utils";

const DOMAINS = ["all", "fitness", "finance", "nutrition"] as const;
type DomainFilter = (typeof DOMAINS)[number];

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function reviveIn(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any time now";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d <= 0) return `${h}h`;
  return `${d}d ${h}h`;
}

export default function Recommendations() {
  const { user } = useSession();
  const recsQ = useRecommendations(user?.id);
  const [domain, setDomain] = useState<DomainFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [decisionsOpen, setDecisionsOpen] = useState(false);

  const filtered = useMemo(
    () => (recsQ.data ?? []).filter((r) => domain === "all" || r.domain === domain),
    [recsQ.data, domain],
  );

  const open = filtered
    .filter((r) => r.status === "open")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const snoozed = filtered
    .filter((r) => r.status === "snoozed")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const decisions = filtered
    .filter((r) => r.status === "acted" || r.status === "dismissed")
    .sort((a, b) => new Date(b.acted_at ?? b.created_at).getTime() - new Date(a.acted_at ?? a.created_at).getTime());

  const openRec = (recsQ.data ?? []).find((r) => r.id === openId) ?? null;

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 safe-bottom">
        <EchoHeadline className="text-[2.5rem] sm:text-[3.5rem]">Recs</EchoHeadline>
        <div className="mt-2 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          Last 60 days · {filtered.length} total
        </div>

        {/* Domain filter pills */}
        <div className="mt-6 flex gap-1 flex-wrap">
          {DOMAINS.map((d) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={cn(
                "border hairline px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.14em] font-mono transition-colors duration-slow ease-swiss",
                domain === d ? "bg-foreground text-background border-foreground" : "hover:bg-secondary",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        {recsQ.isLoading && <div className="mt-8 text-xs text-muted-foreground">Loading…</div>}
        {recsQ.isError && <div className="mt-8 text-xs text-destructive">Failed to load recommendations.</div>}

        {!recsQ.isLoading && filtered.length === 0 && (
          <div className="mt-10 border hairline p-6 text-center text-xs text-muted-foreground uppercase tracking-[0.12em]">
            No recommendations
          </div>
        )}

        <Section title="Open" count={open.length}>
          {open.map((r) => (
            <RecRow key={r.id} rec={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </Section>

        <Section title="Snoozed" count={snoozed.length}>
          {snoozed.map((r) => (
            <RecRow key={r.id} rec={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </Section>

        <section className="mt-8">
          <button
            onClick={() => setDecisionsOpen((v) => !v)}
            className="w-full flex items-center justify-between border-b hairline pb-2"
          >
            <div className="flex items-baseline gap-2">
              <h3 className="font-display text-xl uppercase tracking-[-0.04em]">Recent decisions</h3>
              <span className="text-[0.65rem] font-mono text-muted-foreground">{decisions.length}</span>
            </div>
            <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              {decisionsOpen ? "Hide" : "Show"}
            </span>
          </button>
          {decisionsOpen && (
            <ul className="mt-3 flex flex-col gap-2">
              {decisions.map((r) => (
                <RecRow key={r.id} rec={r} onOpen={() => setOpenId(r.id)} />
              ))}
              {decisions.length === 0 && (
                <li className="py-3 text-xs text-muted-foreground uppercase tracking-[0.12em]">None</li>
              )}
            </ul>
          )}
        </section>
      </main>

      <RecDetailDialog
        recSummary={openRec}
        userId={user!.id}
        open={openId !== null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between border-b hairline pb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-xl uppercase tracking-[-0.04em]">{title}</h3>
          <span className="text-[0.65rem] font-mono text-muted-foreground">{count}</span>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {count === 0 ? (
          <li className="py-3 text-xs text-muted-foreground uppercase tracking-[0.12em]">None</li>
        ) : (
          children
        )}
      </ul>
    </section>
  );
}

function RecRow({ rec, onOpen }: { rec: RecommendationRow; onOpen: () => void }) {
  const age = ageDays(rec.created_at);
  const aging = rec.status === "open" && age > 14;
  const forced = (rec.snooze_count ?? 0) >= 2;
  const drift = Math.max(0, Math.min(1, rec.drift_score ?? 0));
  const dismissed = rec.status === "dismissed";

  let statusLabel = rec.status.toUpperCase();
  if (rec.status === "snoozed") {
    const r = reviveIn(rec.snoozed_until);
    statusLabel = r === "any time now" ? "REVIVES ANY TIME NOW" : `REVIVES IN ${r}`;
  }

  return (
    <li>
      <button
        onClick={onOpen}
        className={cn(
          "w-full text-left border hairline p-3 hover:bg-secondary/60 transition-colors duration-slow ease-swiss",
          dismissed && "opacity-70",
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="border hairline px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] font-mono bg-foreground/5">
            {rec.domain}
          </span>
          <code className="text-[0.65rem] font-mono text-muted-foreground">{rec.id.slice(0, 8)}</code>
          <span className="text-[0.65rem] font-mono text-muted-foreground">{relTime(rec.created_at)}</span>
          {aging && (
            <span className="border border-destructive px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.14em] font-mono text-destructive">
              AGING
            </span>
          )}
          {forced && rec.status !== "acted" && rec.status !== "dismissed" && (
            <span className="border border-destructive px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.14em] font-mono text-destructive">
              FORCED DECISION
            </span>
          )}
          <span
            className={cn(
              "ml-auto text-[0.55rem] uppercase tracking-[0.14em] font-mono",
              rec.status === "open" && "text-foreground",
              rec.status === "snoozed" && "text-muted-foreground",
              rec.status === "acted" && "text-foreground/80",
              dismissed && "text-muted-foreground line-through",
            )}
          >
            {statusLabel}
          </span>
        </div>

        <div className={cn("mt-2 text-sm truncate", dismissed && "line-through")}>
          {rec.tldr}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 h-1 bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${drift * 100}%` }} />
          </div>
          <div className="font-mono text-[0.6rem] text-muted-foreground">{drift.toFixed(2)}</div>
          <div className="font-mono text-[0.6rem] text-muted-foreground">conf {rec.confidence}%</div>
        </div>
      </button>
    </li>
  );
}
