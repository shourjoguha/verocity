/** Two-step add-session menu: Plan vs Activity → pick a day or tag. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/lib/session";
import { appConfig } from "@/config/app.config";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadDoneCountsByDayKey, makeDayKey, nextWeekFromMap } from "@/lib/weekPicker";
import { useActivePlan } from "@/hooks/queries";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Date the new session should be logged on. Format: YYYY-MM-DD. */
  date: string;
}

type Step = "root" | "plan" | "activity";

export function AddSessionMenu({ open, onClose, date }: Props) {
  const nav = useNavigate();
  const { user } = useSession();
  const [step, setStep] = useState<Step>("root");
  const planQ = useActivePlan(user?.id);
  const plan = planQ.data?.parsed ?? null;
  const [doneCounts, setDoneCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!user || !open) return;
    loadDoneCountsByDayKey(user.id).then(setDoneCounts).catch((e) => console.error("loadDoneCounts failed", e));
  }, [user, open]);

  useEffect(() => { if (open) setStep("root"); }, [open]);

  function pickPlanDay(dayName: string) {
    const planDay = plan?.days.find((d) => d.dayName === dayName);
    const dayKey = planDay ? makeDayKey(planDay.dayName, planDay.type) : dayName;
    const w = nextWeekFromMap(doneCounts, dayKey);
    nav(`/log/new?day=${encodeURIComponent(dayName)}&week=${w}&date=${date}`);
    onClose();
  }
  function pickCustomPlan() {
    nav(`/log/new?mode=custom&date=${date}`);
    onClose();
  }
  function pickActivityTag(tag: string) {
    nav(`/log/activity?tag=${tag}&date=${date}`);
    onClose();
  }
  function pickCustomActivity() {
    nav(`/log/activity?date=${date}`);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl tracking-[-0.03em]">
            {step !== "root" && (
              <button onClick={() => setStep("root")} className="p-1 -ml-1 hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
            )}
            {step === "root" && "Add session"}
            {step === "plan" && "Plan day"}
            {step === "activity" && "Activity"}
          </DialogTitle>
          <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">{date}</div>
        </DialogHeader>

        {step === "root" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setStep("plan")}
              className="border hairline p-6 text-left hover:bg-secondary transition-colors duration-slow ease-swiss"
            >
              <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">From</div>
              <div className="font-display text-2xl tracking-[-0.04em] mt-1">Plan</div>
              <div className="mt-2 text-xs text-muted-foreground">A day from your active plan</div>
            </button>
            <button
              onClick={() => setStep("activity")}
              className="border hairline p-6 text-left hover:bg-secondary transition-colors duration-slow ease-swiss"
            >
              <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Log</div>
              <div className="font-display text-2xl tracking-[-0.04em] mt-1">Activity</div>
              <div className="mt-2 text-xs text-muted-foreground">Sport, class, recovery, mobility</div>
            </button>
          </div>
        )}

        {step === "plan" && (
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            <div className="grid gap-1.5">
              {(plan?.days ?? []).map((d) => (
                <button
                  key={d.dayName + d.type}
                  onClick={() => pickPlanDay(d.dayName)}
                  className="border hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss"
                >
                  <div className="font-display text-base tracking-[-0.03em]">{d.type}</div>
                  <div className="text-[0.6rem] uppercase tracking-[0.14em] mt-0.5" aria-hidden>&nbsp;</div>
                </button>
              ))}
              {!plan && <div className="text-xs text-muted-foreground py-4">No active plan.</div>}
              <button
                onClick={pickCustomPlan}
                className="border border-dashed hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss"
              >
                <div className="font-display text-base tracking-[-0.03em]">Custom (blank)</div>
                <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">Build from scratch</div>
              </button>
            </div>
          </div>
        )}

        {step === "activity" && (
          <div>
            <div className="grid grid-cols-2 gap-1.5">
              {appConfig.activity.tags.map((t) => {
                const color = appConfig.activity.tagColors[t] ?? appConfig.activity.fallbackColor;
                return (
                  <button
                    key={t}
                    onClick={() => pickActivityTag(t)}
                    className="border hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss flex items-center gap-2"
                  >
                    <span className="inline-block h-4 w-1" style={{ background: color }} />
                    <span className="font-display text-base tracking-[-0.03em] capitalize">{t}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={pickCustomActivity}
              className={cn("mt-2 w-full border border-dashed hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss")}
            >
              <div className="font-display text-base tracking-[-0.03em]">Custom activity</div>
              <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">Title + tags freely</div>
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
