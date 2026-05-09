/** Logger — heart of the app.
 *  - Accordion sections (configurable / custom)
 *  - Compact tables of sets per movement (planned vs actual)
 *  - Long-press to multi-select; group/ungroup as superset / circuit
 *  - Per-movement and per-set rest timers (manual start)
 *  - Session stopwatch with start / pause / resume / cancel / restart
 *  - Swap movement via library picker, add custom movement
 *  - Date picker for log_date
 *  - Swappable metric column headers (reps ↔ time ↔ distance)
 *  - Custom workout mode with editable section names
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { useSession } from "@/lib/session";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import type { LogDocument, LogGroup, LogItem, LogSection, LogSet, ParsedPlan } from "@/lib/types";
import { buildBlankDocument, buildLogDocument, makeId, migrateDocument } from "@/lib/logBuilder";
import { useLongPress } from "@/hooks/useLongPress";
import { useStopwatch, useCountdown, fmt, fmtLong } from "@/hooks/useTimer";
import { appConfig, type Metric, type SwappableMetric } from "@/config/app.config";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Pause, Play, RotateCcw, X, Save, Plus, Replace, Trash2, Group, Ungroup, Settings2, CalendarIcon, Pencil, ArrowRightLeft, ChevronDown, Mic } from "lucide-react";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/LibraryPicker";
import { loadMaxWeightByMovement, prefillWeightsFromMax } from "@/lib/lastPerformance";
import { makeDayKey, weekForDate } from "@/lib/weekPicker";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { WeightWheel } from "@/components/WeightWheel";
import { VibeCheck } from "@/components/VibeCheck";
import { whyTag, WhyTagHost } from "@/components/WhyTagPrompt";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { RepsStepper } from "@/components/RepsStepper";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function isoWeekIndexFromStart(startDateIso: string | null): number {
  if (!startDateIso) return 1;
  const start = new Date(startDateIso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1));
}

const METRIC_ORDER: Metric[] = ["weight", "reps", "rpe", "distance", "time"];
const SWAPPABLE = appConfig.metrics.swappable as readonly SwappableMetric[];

interface SelectionKey { sectionId: string; groupId: string; itemIndex: number }
const keyOf = (s: string, g: string, i: number) => `${s}::${g}::${i}`;
const parseKey = (k: string): SelectionKey => {
  const [sectionId, groupId, idx] = k.split("::");
  return { sectionId, groupId, itemIndex: parseInt(idx, 10) };
};

export default function Logger() {
  const nav = useNavigate();
  const { user } = useSession();
  const qc = useQueryClient();
  const params = useParams<{ id?: string }>();
  const [search] = useSearchParams();
  const confirm = useConfirm();
  const isCustomMode = search.get("mode") === "custom";

  const [logId, setLogId] = useState<string | null>(params.id ?? null);
  const [doc, setDoc] = useState<LogDocument | null>(null);
  const [dayKey, setDayKey] = useState<string>("");
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planStartIso, setPlanStartIso] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<string>(appConfig.activity.defaultType);
  const [tags, setTags] = useState<string[]>(["strength"]);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [status, setStatus] = useState<"planned" | "in_progress" | "paused" | "done" | "cancelled">("planned");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [accumSec, setAccumSec] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState<{ kind: "swap" | "add"; sectionId: string; groupId?: string; itemIndex?: number } | null>(null);
  const [supersetPicker, setSupersetPicker] = useState<{ sectionId: string; groupId: string; itemIndex: number } | null>(null);
  const [restTimer, setRestTimer] = useState<{ targetSeconds: number; label: string } | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [warmupNote, setWarmupNote] = useState<string>("");
  const [vibeOpen, setVibeOpen] = useState(false);
  const [weightWheel, setWeightWheel] = useState<{ sectionId: string; groupId: string; itemIdx: number; setIdx: number; current: number | null | undefined } | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const hasShownVibeRef = useRef(false);
  const voiceDeniedRef = useRef(false);

  const sw = useStopwatch();

  // Cache of all-time max weight per movement (lowercased name); populated on initial load.
  const maxByMovRef = useRef<Map<string, number>>(new Map());
  function seedWeightOnNewItem(item: LogItem) {
    if (!item.metrics.includes("weight")) return;
    const max = maxByMovRef.current.get((item.name ?? "").trim().toLowerCase());
    if (max == null) return;
    for (const s of item.sets) {
      if (s.actual.weight == null) {
        s.actual.weight = max;
        s.actual.prefilled = true;
      }
    }
  }

  // Initial load
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
      if (logId) {
        const { data } = await supabase.from("workout_logs").select("*").eq("id", logId).maybeSingle();
        if (data) {
          setDoc(migrateDocument(data.data as unknown as LogDocument));
          setDayKey(data.day_key ?? "");
          setWeekNumber(data.week_number ?? 1);
          setPlanId(data.plan_id);
          setStatus(data.status as typeof status);
          setStartedAt(data.started_at);
          setEndedAt(data.ended_at);
          setAccumSec(data.total_seconds ?? 0);
          setLogDate(data.log_date ? new Date(data.log_date + "T00:00:00") : new Date());
          setActivityType(data.activity_type ?? appConfig.activity.defaultType);
          setTags(data.tags ?? ["strength"]);
          sw.setSeconds(data.total_seconds ?? 0);
          // Try to find warmup free-text from the linked plan day.
          if (data.plan_id && data.day_key) {
            const { data: planRow } = await supabase.from("plans").select("parsed").eq("id", data.plan_id).maybeSingle();
            if (planRow) {
              const plan = planRow.parsed as unknown as ParsedPlan;
              const dayName = (data.day_key ?? "").split("—")[0].trim();
              const planDay = plan.days.find((d) => d.dayName === dayName);
              if (planDay?.warmup) setWarmupNote(planDay.warmup);
            }
          }
          if (data.plan_id) {
            const { data: planRow } = await supabase.from("plans").select("start_date").eq("id", data.plan_id).maybeSingle();
            const start = planRow?.start_date ?? null;
            setPlanStartIso(start);
            // Re-derive week from log_date so historical/edited rows stay correct.
            if (start && data.log_date) setWeekNumber(weekForDate(start, data.log_date));
          }
        }
      } else {
        // Seed log date from ?date= if present.
        const dateParam = search.get("date");
        if (dateParam) setLogDate(new Date(dateParam + "T00:00:00"));

        if (isCustomMode) {
          const blank = buildBlankDocument();
          const maxByMov = await loadMaxWeightByMovement(user.id);
          maxByMovRef.current = maxByMov;
          setDoc(prefillWeightsFromMax(blank, maxByMov));
          setDayKey("Custom workout");
          setWeekNumber(0);
          setActivityType("strength");
          setTags(["strength"]);
        } else {
          const day = search.get("day") ?? DAY_NAMES[new Date().getDay()];
          const week = parseInt(search.get("week") ?? "1", 10);
          const { data: planRow } = await supabase
            .from("plans").select("id,parsed,start_date").eq("owner_user_id", user.id).eq("is_active", true).maybeSingle();
          if (!planRow) {
            toast.error("No active plan. Upload one first.");
            nav("/plan/upload");
            return;
          }
          const plan = (planRow.parsed as unknown as ParsedPlan);
          setPlanStartIso(planRow.start_date ?? null);
          const planDay = plan.days.find((d) => d.dayName === day) ?? plan.days[0];
          setPlanId(planRow.id);
          const dKey = makeDayKey(planDay.dayName, planDay.type);
          setDayKey(dKey);
          const dateParam2 = search.get("date") ?? new Date().toISOString().slice(0, 10);
          const resolvedWeek = week || weekForDate(planRow.start_date ?? null, dateParam2);
          setWeekNumber(resolvedWeek);
          const built = buildLogDocument(plan, planDay, resolvedWeek);
          const maxByMov = await loadMaxWeightByMovement(user.id);
          maxByMovRef.current = maxByMov;
          setDoc(prefillWeightsFromMax(built, maxByMov));
          const inferred = appConfig.activity.dayTypeTag(planDay.type);
          setActivityType(inferred);
          setTags([inferred]);
          if (planDay.warmup) setWarmupNote(planDay.warmup);
        }
        // Auto-start the timer for any newly-opened session (plan-driven or custom).
        if (!hasShownVibeRef.current) {
          hasShownVibeRef.current = true;
          setVibeOpen(true);
        } else {
          setStartedAt(new Date().toISOString());
          setStatus("in_progress");
          sw.start();
        }
      }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load session");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-save every N seconds while doc is dirty
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = true; }, [doc, status, accumSec, logDate, tags]);
  useEffect(() => {
    const i = window.setInterval(() => { if (dirtyRef.current && doc && user) saveLog(false); }, appConfig.session.autoSaveIntervalSeconds * 1000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, status, accumSec, user, logDate, tags]);

  // Sync stopwatch into accumSec
  useEffect(() => { setAccumSec(sw.seconds); }, [sw.seconds]);

  // Whenever logDate or plan start changes, recompute the week from the date
  // (planned sessions only — custom sessions keep weekNumber = 0).
  useEffect(() => {
    if (!planId || !planStartIso) return;
    const iso = format(logDate, "yyyy-MM-dd");
    setWeekNumber(weekForDate(planStartIso, iso));
  }, [logDate, planId, planStartIso]);

  async function saveLog(showToast = true) {
    if (!user || !doc) return;
    sw.pause();
    if (status === "in_progress") setStatus("paused");
    dirtyRef.current = false;
    const payload = {
      owner_user_id: user.id,
      plan_id: planId,
      day_key: dayKey,
      week_number: weekNumber || null,
      status,
      started_at: startedAt,
      ended_at: endedAt,
      total_seconds: accumSec,
      data: doc as never,
      log_date: format(logDate, "yyyy-MM-dd"),
      activity_type: activityType,
      tags,
    };
    if (logId) {
      const { error } = await supabase.from("workout_logs").update(payload).eq("id", logId);
      if (error) { toast.error(`Save failed`); return; }
    } else {
      const { data, error } = await supabase.from("workout_logs").insert([payload]).select("id").single();
      if (error || !data) { toast.error(`Save failed`); return; }
      setLogId(data.id);
      window.history.replaceState({}, "", `/log/${data.id}`);
    }
    setSavedTick((n) => n + 1);
    if (showToast) toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["logs"] });
  }

  // Session controls
  function startSession() {
    if (!startedAt) setStartedAt(new Date().toISOString());
    setStatus("in_progress");
    sw.start();
  }
  function pauseSession() { sw.pause(); setStatus("paused"); }
  function resumeSession() { sw.start(); setStatus("in_progress"); }
  async function cancelSession() {
    const ok = await confirm({
      title: "Delete this session?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!ok) return;
    const why = await whyTag();
    if (why) setTags((t) => (t.includes(why) ? t : [...t, why]));
    sw.pause();
    if (logId) {
      const { error } = await supabase.from("workout_logs").delete().eq("id", logId);
      if (error) { toast.error("Delete failed"); return; }
    }
    qc.invalidateQueries({ queryKey: ["logs"] });
    toast.success("Session deleted");
    nav("/");
  }
  async function restartSession() {
    const ok = await confirm({
      title: "Restart timer?",
      description: "Timer resets to 00:00. Logged sets are kept.",
      confirmLabel: "Restart timer",
    });
    if (!ok) return;
    sw.reset();
    setStartedAt(new Date().toISOString());
    setEndedAt(null);
    setStatus("in_progress");
    sw.start();
  }
  async function finishSession() {
    sw.pause();
    const endIso = new Date().toISOString();
    // Light-day prompt: if planned >= 4 sets and < 60% completed.
    let extraTags: string[] = [];
    if (doc) {
      let plannedCount = 0, completedCount = 0;
      for (const sec of doc.sections) for (const g of sec.groups) for (const it of g.items) {
        for (const s of it.sets) {
          if (s.planned) plannedCount += 1;
          if (s.actual.completed) completedCount += 1;
        }
      }
      if (plannedCount >= 4 && completedCount / plannedCount < 0.6) {
        const why = await whyTag();
        if (why) extraTags = [why];
      }
    }
    const finalTags = extraTags.length ? Array.from(new Set([...tags, ...extraTags])) : tags;
    if (extraTags.length) setTags(finalTags);
    setStatus("done");
    setEndedAt(endIso);
    if (!user || !doc) return;
    dirtyRef.current = false;
    const payload = {
      owner_user_id: user.id,
      plan_id: planId,
      day_key: dayKey,
      week_number: weekNumber || null,
      status: "done",
      started_at: startedAt,
      ended_at: endIso,
      total_seconds: accumSec,
      data: doc as never,
      log_date: format(logDate, "yyyy-MM-dd"),
      activity_type: activityType,
      tags: finalTags,
    };
    if (logId) {
      const { error } = await supabase.from("workout_logs").update(payload).eq("id", logId);
      if (error) { toast.error("Save failed"); return; }
    } else {
      const { data, error } = await supabase.from("workout_logs").insert([payload]).select("id").single();
      if (error || !data) { toast.error("Save failed"); return; }
      setLogId(data.id);
    }
    setSavedTick((n) => n + 1);
    toast.success("Saved");
  }
  async function saveAsDone() {
    // Retroactive log: skip the timer entirely. Stamp start/end at noon of the log date.
    if (!user || !doc) return;
    const noon = new Date(logDate);
    noon.setHours(12, 0, 0, 0);
    const iso = noon.toISOString();
    const startIso = startedAt ?? iso;
    dirtyRef.current = false;
    const payload = {
      owner_user_id: user.id,
      plan_id: planId,
      day_key: dayKey,
      week_number: weekNumber || null,
      status: "done",
      started_at: startIso,
      ended_at: iso,
      total_seconds: accumSec,
      data: doc as never,
      log_date: format(logDate, "yyyy-MM-dd"),
      activity_type: activityType,
      tags,
    };
    if (logId) {
      const { error } = await supabase.from("workout_logs").update(payload).eq("id", logId);
      if (error) { toast.error("Save failed"); return; }
    } else {
      const { data, error } = await supabase.from("workout_logs").insert([payload]).select("id").single();
      if (error || !data) { toast.error("Save failed"); return; }
      setLogId(data.id);
    }
    setStartedAt(startIso);
    setEndedAt(iso);
    setStatus("done");
    toast.success("Saved as done");
    nav("/");
  }

  // Mutators
  function updateDoc(mut: (d: LogDocument) => void) {
    setDoc((prev) => {
      if (!prev) return prev;
      const next: LogDocument = JSON.parse(JSON.stringify(prev));
      mut(next);
      return next;
    });
  }

  function setActual(sectionId: string, groupId: string, itemIdx: number, setIdx: number, metric: Metric, value: number | null) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      it.sets[setIdx].actual[metric] = value;
      // First user edit promotes prefilled values to confirmed.
      if (it.sets[setIdx].actual.prefilled) it.sets[setIdx].actual.prefilled = false;
    });
  }
  /** Long-press # cell on a completed set: copy values into the next empty set. */
  function cloneForward(sectionId: string, groupId: string, itemIdx: number, setIdx: number) {
    let nextIdx = -1;
    let armRest = false;
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      const src = it.sets[setIdx];
      if (!src?.actual?.completed) return;
      const dstIdx = it.sets.findIndex((st, i) => i > setIdx && !st.actual.completed && st.actual.weight == null && st.actual.reps == null);
      if (dstIdx < 0) return;
      const dst = it.sets[dstIdx];
      const swap = (appConfig.metrics.swappable as readonly string[]).find((m) => it.metrics.includes(m as Metric)) as Metric | undefined;
      if (typeof src.actual.weight === "number") dst.actual.weight = src.actual.weight;
      if (swap === "reps") {
        if (typeof src.actual.reps === "number" && dst.planned?.reps !== "max") dst.actual.reps = src.actual.reps;
      } else if (swap && typeof src.actual[swap] === "number") {
        dst.actual[swap] = src.actual[swap];
      }
      dst.actual.prefilled = true;
      nextIdx = dstIdx;
      armRest = true;
    });
    if (armRest) {
      const item = doc?.sections.find((s) => s.id === sectionId)?.groups.find((g) => g.id === groupId)?.items[itemIdx];
      if (item) setRestTimer({ targetSeconds: item.restBetweenSetsSeconds, label: `${item.name} · set ${nextIdx + 1}` });
      try { navigator.vibrate?.(15); } catch { /* noop */ }
      const fk = `${sectionId}::${groupId}::${itemIdx}::${nextIdx}`;
      setFlashKey(fk);
      window.setTimeout(() => setFlashKey((cur) => (cur === fk ? null : cur)), 220);
    }
  }
  function toggleSetComplete(sectionId: string, groupId: string, itemIdx: number, setIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      it.sets[setIdx].actual.completed = !it.sets[setIdx].actual.completed;
    });
  }
  function addSet(sectionId: string, groupId: string, itemIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      const last = it.sets[it.sets.length - 1];
      const seedActual: LogSet["actual"] = {};
      if (it.metrics.includes("rpe")) { seedActual.rpe = appConfig.rpe.default; seedActual.prefilled = true; }
      it.sets.push({ planned: last?.planned ?? null, actual: seedActual, notations: last?.notations ?? [], restAfterSeconds: it.restBetweenSetsSeconds });
    });
  }
  function removeSet(sectionId: string, groupId: string, itemIdx: number, setIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g.items[itemIdx].sets.splice(setIdx, 1);
    });
  }
  function setItemRest(sectionId: string, groupId: string, itemIdx: number, sec: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g.items[itemIdx].restBetweenSetsSeconds = sec;
      for (const st of g.items[itemIdx].sets) st.restAfterSeconds = sec;
    });
  }
  function setGroupRest(sectionId: string, groupId: string, key: "restAfterRoundSeconds" | "restWithinSeconds", sec: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g[key] = sec;
    });
  }
  function changeGroupKind(sectionId: string, groupId: string, kind: LogGroup["kind"]) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g.kind = kind;
      if (kind !== "single" && g.restWithinSeconds === undefined) g.restWithinSeconds = appConfig.timer.defaults.withinSupersetSeconds;
    });
  }
  function removeItem(sectionId: string, groupId: string, itemIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const gIdx = s.groups.findIndex((x) => x.id === groupId);
      const g = s.groups[gIdx];
      g.items.splice(itemIdx, 1);
      if (g.items.length === 0) s.groups.splice(gIdx, 1);
    });
  }
  function toggleItemComplete(sectionId: string, groupId: string, itemIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      const anyIncomplete = it.sets.some((st) => !st.actual.completed);
      for (const st of it.sets) {
        st.actual.completed = anyIncomplete;
        if (st.actual.prefilled) st.actual.prefilled = false;
      }
    });
  }
  function moveItem(sectionId: string, groupId: string, itemIdx: number, dstSectionId: string) {
    if (sectionId === dstSectionId) return;
    updateDoc((d) => {
      const src = d.sections.find((x) => x.id === sectionId)!;
      const dst = d.sections.find((x) => x.id === dstSectionId);
      if (!dst) return;
      const gIdx = src.groups.findIndex((x) => x.id === groupId);
      if (gIdx < 0) return;
      const g = src.groups[gIdx];
      const [item] = g.items.splice(itemIdx, 1);
      if (g.items.length === 0) src.groups.splice(gIdx, 1);
      dst.groups.push({
        id: makeId(),
        kind: "single",
        items: [item],
        restAfterRoundSeconds: item.restBetweenSetsSeconds,
      });
    });
  }
  function swapMovement(target: { sectionId: string; groupId: string; itemIndex: number }, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric; default_rest_seconds: number }) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === target.sectionId)!;
      const g = s.groups.find((x) => x.id === target.groupId)!;
      const it = g.items[target.itemIndex];
      it.movementId = mov.id;
      it.name = mov.name;
      // Enforce: weight always present + only one swappable.
      const set = new Set<Metric>(mov.metrics);
      set.add("weight");
      const present = SWAPPABLE.filter((m) => set.has(m));
      const keep = present[0] ?? "reps";
      for (const m of SWAPPABLE) set.delete(m);
      set.add(keep);
      it.metrics = Array.from(set);
      it.primaryMetric = mov.primaryMetric;
      it.restBetweenSetsSeconds = mov.default_rest_seconds || it.restBetweenSetsSeconds;
      seedWeightOnNewItem(it);
    });
  }
  function addMovement(sectionId: string, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric; default_rest_seconds: number }) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const set = new Set<Metric>(mov.metrics);
      set.add("weight");
      const present = SWAPPABLE.filter((m) => set.has(m));
      const keep = present[0] ?? "reps";
      for (const m of SWAPPABLE) set.delete(m);
      set.add(keep);
      const item: LogItem = {
        movementId: mov.id,
        name: mov.name,
        metrics: Array.from(set),
        primaryMetric: mov.primaryMetric,
        notations: [],
        sets: [{ planned: null, actual: {}, notations: [], restAfterSeconds: mov.default_rest_seconds }],
        restBetweenSetsSeconds: mov.default_rest_seconds || appConfig.timer.defaults.betweenSetsSeconds,
      };
      seedWeightOnNewItem(item);
      s.groups.push({
        id: makeId(),
        kind: "single",
        items: [item],
        restAfterRoundSeconds: mov.default_rest_seconds || appConfig.timer.defaults.betweenSetsSeconds,
      });
    });
  }
  function toggleNotation(sectionId: string, groupId: string, itemIdx: number, setIdx: number, tag: string) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const set = g.items[itemIdx].sets[setIdx];
      const i = set.notations.indexOf(tag);
      if (i >= 0) set.notations.splice(i, 1);
      else set.notations.push(tag);
    });
  }
  /** Toggle a notation across every set of an item (movement-level). */
  function toggleItemNotation(sectionId: string, groupId: string, itemIdx: number, tag: string) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      const allHave = it.sets.length > 0 && it.sets.every((st) => st.notations.includes(tag));
      for (const st of it.sets) {
        const i = st.notations.indexOf(tag);
        if (allHave) {
          if (i >= 0) st.notations.splice(i, 1);
        } else {
          if (i < 0) st.notations.push(tag);
        }
      }
      // Also reflect on the item-level notations array for the header chip display.
      const headerHas = it.notations.includes(tag);
      if (allHave && headerHas) it.notations.splice(it.notations.indexOf(tag), 1);
      if (!allHave && !headerHas) it.notations.push(tag);
    });
  }
  /** Merge a source movement into a target group as a superset (same section). */
  function mergeIntoSuperset(target: { sectionId: string; groupId: string; itemIndex: number }, source: { sectionId: string; groupId: string; itemIndex: number }) {
    if (target.sectionId !== source.sectionId) {
      toast.error("Superset within the same section.");
      return;
    }
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === target.sectionId)!;
      const srcGroupIdx = s.groups.findIndex((x) => x.id === source.groupId);
      if (srcGroupIdx < 0) return;
      const srcGroup = s.groups[srcGroupIdx];
      const [moved] = srcGroup.items.splice(source.itemIndex, 1);
      if (!moved) return;
      if (srcGroup.items.length === 0) s.groups.splice(srcGroupIdx, 1);
      const tgt = s.groups.find((x) => x.id === target.groupId);
      if (!tgt) return;
      if (tgt.kind === "single") {
        tgt.kind = "superset";
        if (tgt.restWithinSeconds === undefined) tgt.restWithinSeconds = appConfig.timer.defaults.withinSupersetSeconds;
        if (tgt.restAfterRoundSeconds === undefined) tgt.restAfterRoundSeconds = appConfig.timer.defaults.afterSupersetSeconds;
      }
      const insertAt = Math.min(target.itemIndex + 1, tgt.items.length);
      tgt.items.splice(insertAt, 0, moved);
    });
  }
  /** Add a new movement directly into an existing group as part of a superset. */
  function addMovementToGroup(sectionId: string, groupId: string, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric; default_rest_seconds: number }) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId);
      if (!g) return;
      const set = new Set<Metric>(mov.metrics);
      set.add("weight");
      const present = SWAPPABLE.filter((m) => set.has(m));
      const keep = present[0] ?? "reps";
      for (const m of SWAPPABLE) set.delete(m);
      set.add(keep);
      const item: LogItem = {
        movementId: mov.id,
        name: mov.name,
        metrics: Array.from(set),
        primaryMetric: mov.primaryMetric,
        notations: [],
        sets: [{ planned: null, actual: {}, notations: [], restAfterSeconds: mov.default_rest_seconds }],
        restBetweenSetsSeconds: mov.default_rest_seconds || appConfig.timer.defaults.betweenSetsSeconds,
      };
      seedWeightOnNewItem(item);
      g.items.push(item);
      if (g.kind === "single") {
        g.kind = "superset";
        if (g.restWithinSeconds === undefined) g.restWithinSeconds = appConfig.timer.defaults.withinSupersetSeconds;
        if (g.restAfterRoundSeconds === undefined) g.restAfterRoundSeconds = appConfig.timer.defaults.afterSupersetSeconds;
      }
    });
  }
  function swapMetric(sectionId: string, groupId: string, itemIdx: number, oldMetric: SwappableMetric, newMetric: SwappableMetric) {
    if (oldMetric === newMetric) return;
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      it.metrics = it.metrics.filter((m) => m !== oldMetric).concat(newMetric);
      // Ensure weight stays
      if (!it.metrics.includes("weight")) it.metrics.unshift("weight");
      // Clear stale values for the replaced metric
      for (const set of it.sets) {
        delete set.actual[oldMetric];
      }
      if (it.primaryMetric === oldMetric) it.primaryMetric = newMetric;
    });
  }

  // Custom-section editing
  function addSection() {
    updateDoc((d) => {
      d.sections.push({ id: makeId(), name: "New section", groups: [] });
    });
  }
  function renameSection(sectionId: string, name: string) {
    if (!name.trim()) return;
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId);
      if (s) s.name = name.trim();
    });
  }
  async function removeSection(sectionId: string) {
    const ok = await confirm({
      title: "Remove section?",
      description: "All movements within will be removed.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    updateDoc((d) => {
      d.sections = d.sections.filter((s) => s.id !== sectionId);
    });
  }

  // Selection
  function toggleSelect(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }
  function groupSelected(kind: "superset" | "circuit") {
    if (!doc || selected.size < 2) return;
    const keys = Array.from(selected).map(parseKey);
    const sectionId = keys[0].sectionId;
    if (!keys.every((k) => k.sectionId === sectionId)) {
      toast.error("Group items within the same section.");
      return;
    }
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const items: LogItem[] = [];
      const removeFrom: { groupId: string; itemIndex: number }[] = [];
      for (const k of keys) {
        const g = s.groups.find((x) => x.id === k.groupId)!;
        items.push(g.items[k.itemIndex]);
        removeFrom.push({ groupId: k.groupId, itemIndex: k.itemIndex });
      }
      removeFrom.sort((a, b) => (a.groupId === b.groupId ? b.itemIndex - a.itemIndex : 0));
      for (const r of removeFrom) {
        const g = s.groups.find((x) => x.id === r.groupId)!;
        g.items.splice(r.itemIndex, 1);
      }
      s.groups = s.groups.filter((g) => g.items.length > 0);
      s.groups.push({
        id: makeId(),
        kind,
        items,
        restAfterRoundSeconds: appConfig.timer.defaults.afterSupersetSeconds,
        restWithinSeconds: appConfig.timer.defaults.withinSupersetSeconds,
      });
    });
    clearSelection();
  }
  function ungroupSelected() {
    if (!doc || selected.size === 0) return;
    const keys = Array.from(selected).map(parseKey);
    updateDoc((d) => {
      for (const k of keys) {
        const s = d.sections.find((x) => x.id === k.sectionId)!;
        const g = s.groups.find((x) => x.id === k.groupId)!;
        if (g.kind === "single") continue;
        const item = g.items[k.itemIndex];
        if (!item) continue;
        g.items.splice(k.itemIndex, 1);
        s.groups.push({
          id: makeId(),
          kind: "single",
          items: [item],
          restAfterRoundSeconds: item.restBetweenSetsSeconds,
        });
        if (g.items.length === 1) g.kind = "single";
      }
      for (const s of d.sections) s.groups = s.groups.filter((g) => g.items.length > 0);
    });
    clearSelection();
  }

  function toggleTag(t: string) {
    setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  if (!doc) {
    return (<><TopBar title="Logger" /><main className="p-8 text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading…</main></>);
  }

  const allowSectionEdit = isCustomMode || !planId;

  return (
    <>
      <TopBar title={dayKey || "Logger"} />
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-4 safe-bottom">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <EchoHeadline className="text-[1.75rem] sm:text-[2.25rem]">{dayKey || "Session"}</EchoHeadline>
          {weekNumber > 0 && <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Week {weekNumber}</div>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 border hairline px-3 py-1.5 text-xs hover:bg-secondary transition-colors duration-slow ease-swiss">
                <CalendarIcon className="h-3 w-3" />
                <span className="font-mono">{format(logDate, "yyyy-MM-dd")}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={logDate}
                onSelect={(d) => d && setLogDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-1">
            {appConfig.activity.tags.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={cn(
                    "text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border transition-colors duration-slow ease-swiss",
                    on ? "bg-foreground text-background border-foreground" : "hairline hover:bg-secondary",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <SessionTimer
          accumSec={accumSec}
          status={status}
          startedAt={startedAt}
          endedAt={endedAt}
          onStart={startSession}
          onPause={pauseSession}
          onResume={resumeSession}
          onCancel={cancelSession}
          onRestart={restartSession}
          onFinish={finishSession}
          onSave={() => saveLog(true)}
          onSaveAsDone={saveAsDone}
        />

        <Accordion type="multiple" defaultValue={doc.sections.filter((s) => s.name !== "Warm-up").map((s) => s.id)} className="mt-6">
          {doc.sections.map((section) => {
            const isWarmup = section.name === "Warm-up";
            if (isWarmup) {
              return (
                <CompactWarmupSection
                  key={section.id}
                  section={section}
                  freeText={warmupNote}
                  onToggleItemComplete={toggleItemComplete}
                  onRemoveItem={removeItem}
                  onAddMovement={() => setPickerOpen({ kind: "add", sectionId: section.id })}
                />
              );
            }
            return (
              <AccordionItem key={section.id} value={section.id} className="border-b hairline">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-baseline gap-3 w-full">
                    <SectionTitle
                      name={section.name}
                      editable={allowSectionEdit}
                      onRename={(n) => renameSection(section.id, n)}
                      onRemove={() => removeSection(section.id)}
                    />
                    <span className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
                      {section.groups.reduce((n, g) => n + g.items.length, 0)} mvts · {section.groups.reduce((n, g) => n + g.items.reduce((m, it) => m + it.sets.length, 0), 0)} sets
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="space-y-3">
                    {section.groups.map((group) => (
                      <GroupBlock
                        key={group.id}
                        section={section}
                        allSections={doc.sections}
                        group={group}
                        selected={selected}
                        onSelectToggle={toggleSelect}
                        onSetActual={setActual}
                        onToggleComplete={toggleSetComplete}
                        onToggleItemComplete={toggleItemComplete}
                        onAddSet={addSet}
                        onRemoveSet={removeSet}
                        onItemRest={setItemRest}
                        onGroupRest={setGroupRest}
                        onChangeKind={changeGroupKind}
                        onRemoveItem={removeItem}
                        onMoveItem={moveItem}
                        onSwap={(g, i) => setPickerOpen({ kind: "swap", sectionId: section.id, groupId: g, itemIndex: i })}
                        onSwapMetric={swapMetric}
                        onToggleNotation={toggleNotation}
                        onToggleItemNotation={toggleItemNotation}
                        onSuperset={(sId, gId, i) => setSupersetPicker({ sectionId: sId, groupId: gId, itemIndex: i })}
                        onStartRest={(seconds, label) => setRestTimer({ targetSeconds: seconds, label })}
                        onCloneForward={cloneForward}
                        onOpenWeightWheel={(sId, gId, i, setIdx, current) => setWeightWheel({ sectionId: sId, groupId: gId, itemIdx: i, setIdx, current })}
                        flashKey={flashKey}
                        voiceDeniedRef={voiceDeniedRef}
                      />
                    ))}
                    <button
                      onClick={() => setPickerOpen({ kind: "add", sectionId: section.id })}
                      className="w-full border border-dashed hairline py-3 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary transition-colors duration-slow ease-swiss"
                    >
                      <Plus className="inline h-3 w-3 mr-1" /> Add movement
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {allowSectionEdit && (
          <button
            onClick={addSection}
            className="mt-4 w-full border border-dashed hairline py-3 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary transition-colors duration-slow ease-swiss"
          >
            <Plus className="inline h-3 w-3 mr-1" /> Add section
          </button>
        )}

        <div className="mt-8 text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
          {savedTick > 0 ? `Saved · ${savedTick} ticks` : "Auto-save every 15s"}
        </div>
      </main>

      {/* Floating selection action bar */}
      {selected.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 animate-fade-in" style={{ bottom: `calc(1rem + env(safe-area-inset-bottom))` }}>
          <div className="bg-foreground text-background border-2 border-foreground shadow-lg flex flex-wrap items-center justify-center gap-1 px-2 py-1 max-w-[calc(100vw-1rem)]">
            <span className="px-2 text-[0.65rem] uppercase tracking-[0.14em]">{selected.size} selected</span>
            <button onClick={() => groupSelected("superset")} className="touch-target-sm px-3 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80 flex items-center gap-1"><Group className="h-3 w-3" /> Superset</button>
            <button onClick={() => groupSelected("circuit")} className="touch-target-sm px-3 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80 flex items-center gap-1"><Group className="h-3 w-3" /> Circuit</button>
            <button onClick={ungroupSelected} className="touch-target-sm px-3 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80 flex items-center gap-1"><Ungroup className="h-3 w-3" /> Ungroup</button>
            <button onClick={clearSelection} aria-label="Clear" className="touch-target-sm px-3 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80"><X className="h-3 w-3" /></button>
          </div>
        </div>
      )}

      {/* Rest timer overlay */}
      {restTimer && (
        <RestOverlay
          targetSeconds={restTimer.targetSeconds}
          label={restTimer.label}
          onClose={() => setRestTimer(null)}
        />
      )}

      {/* Library picker modal */}
      {pickerOpen && (
        <LibraryPicker
          ownerId={user?.id}
          onClose={() => setPickerOpen(null)}
          onPick={(mov) => {
            if (pickerOpen.kind === "swap" && pickerOpen.groupId !== undefined && pickerOpen.itemIndex !== undefined) {
              swapMovement({ sectionId: pickerOpen.sectionId, groupId: pickerOpen.groupId, itemIndex: pickerOpen.itemIndex }, mov);
            } else if (pickerOpen.groupId !== undefined) {
              // Add into an existing group (used by SupersetPicker → "+ New movement").
              addMovementToGroup(pickerOpen.sectionId, pickerOpen.groupId, mov);
            } else {
              addMovement(pickerOpen.sectionId, mov);
            }
            setPickerOpen(null);
          }}
        />
      )}

      {/* Superset picker — choose another movement in the same day to pair with */}
      {supersetPicker && doc && (
        <SupersetPicker
          doc={doc}
          target={supersetPicker}
          onClose={() => setSupersetPicker(null)}
          onPickExisting={(src) => {
            mergeIntoSuperset(supersetPicker, src);
            setSupersetPicker(null);
          }}
          onPickNew={() => {
            setPickerOpen({ kind: "add", sectionId: supersetPicker.sectionId, groupId: supersetPicker.groupId });
            setSupersetPicker(null);
          }}
        />
      )}

      <VibeCheck
        open={vibeOpen}
        onStart={(v) => {
          updateDoc((d) => { d.session = { ...(d.session ?? {}), vibe: v }; });
          setVibeOpen(false);
          setStartedAt(new Date().toISOString());
          setStatus("in_progress");
          sw.start();
        }}
        onSkip={() => {
          setVibeOpen(false);
          setStartedAt(new Date().toISOString());
          setStatus("in_progress");
          sw.start();
        }}
      />

      <WeightWheel
        open={weightWheel !== null}
        initial={weightWheel?.current}
        onClose={() => setWeightWheel(null)}
        onCommit={(v) => {
          if (!weightWheel) return;
          setActual(weightWheel.sectionId, weightWheel.groupId, weightWheel.itemIdx, weightWheel.setIdx, "weight", v);
        }}
      />

      <WhyTagHost />
    </>
  );
}

/* ------------------ Subcomponents ------------------ */

/** Subtext under the movement name showing planned set notation + accumulated tags. */
function MovementMeta({ item }: { item: LogItem }) {
  const planned = item.sets[0]?.planned?.raw ?? "";
  const tagSet = new Set<string>(item.notations);
  for (const s of item.sets) for (const t of s.notations) tagSet.add(t);
  const tags = Array.from(tagSet).join(" ");
  if (!planned && !tags) return null;
  return (
    <span className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground font-mono mt-0.5 truncate">
      {planned}{planned && tags ? " · " : ""}{tags}
    </span>
  );
}

/** Tags submenu inside the Settings2 popover; toggles a notation across all sets. */
function TagsSubmenu({ item, onToggle }: { item: LogItem; onToggle: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  const active = new Set<string>(item.notations);
  for (const s of item.sets) for (const t of s.notations) active.add(t);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"
      >
        <Pencil className="h-3 w-3" /> Tags
      </button>
      {open && (
        <div className="border-t hairline p-2 flex flex-wrap gap-1">
          {appConfig.notations.map((n) => {
            const on = active.has(n.label);
            return (
              <button
                key={n.label}
                onClick={() => onToggle(n.label)}
                className={`text-[0.6rem] uppercase tracking-[0.1em] px-1.5 py-0.5 border ${on ? "bg-foreground text-background border-foreground" : "hairline"}`}
                title={n.meaning}
              >
                {n.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ name, editable, onRename, onRemove }: { name: string; editable: boolean; onRename: (n: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  if (!editable) {
    return <span className="font-display text-xl uppercase tracking-[-0.04em]">{name}</span>;
  }
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { onRename(value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "Escape") { setValue(name); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="font-display text-xl uppercase tracking-[-0.04em] bg-transparent border-b hairline focus:border-foreground focus:outline-none"
      />
    );
  }
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <span className="font-display text-xl uppercase tracking-[-0.04em]">{name}</span>
      <button onClick={() => setEditing(true)} aria-label="Rename section" className="touch-target-sm text-muted-foreground/60 hover:text-foreground transition-colors"><Pencil className="h-3 w-3" /></button>
      <button onClick={onRemove} aria-label="Remove section" className="touch-target-sm text-muted-foreground/60 hover:text-foreground transition-colors"><Trash2 className="h-3 w-3" /></button>
    </div>
  );
}

function SessionTimer(props: {
  accumSec: number;
  status: "planned" | "in_progress" | "paused" | "done" | "cancelled";
  startedAt: string | null;
  endedAt: string | null;
  onStart: () => void; onPause: () => void; onResume: () => void;
  onCancel: () => void; onRestart: () => void; onFinish: () => void; onSave: () => void; onSaveAsDone: () => void;
}) {
  const { accumSec, status, onStart, onPause, onResume, onCancel, onRestart, onFinish, onSave, onSaveAsDone } = props;
  return (
    <section className="mt-4 border hairline p-3 flex items-center justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <div className="font-mono text-3xl tabular-nums tracking-tight">{fmtLong(accumSec)}</div>
        <span className="chip">{status.replace("_", " ")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {status === "planned" && (
          <>
            <button onClick={onStart} className="ll-btn flex items-center gap-1"><Play className="h-3 w-3" /> Start</button>
            <button onClick={onSaveAsDone} className="ll-btn" title="Skip timer, mark as done">Save as done</button>
          </>
        )}
        {status === "in_progress" && (
          <>
            <button onClick={onPause} className="ll-btn flex items-center gap-1"><Pause className="h-3 w-3" /> Pause</button>
            <button onClick={onFinish} className="ll-btn">Finish</button>
          </>
        )}
        {status === "paused" && (
          <>
            <button onClick={onResume} className="ll-btn flex items-center gap-1"><Play className="h-3 w-3" /> Resume</button>
            <button onClick={onFinish} className="ll-btn">Finish</button>
          </>
        )}
        <button onClick={onRestart} className="ll-btn flex items-center gap-1" title="Restart timer"><RotateCcw className="h-3 w-3" /></button>
        <button onClick={onCancel} className="ll-btn flex items-center gap-1" title="Cancel"><X className="h-3 w-3" /></button>
        <button onClick={onSave} className="ll-btn flex items-center gap-1" title="Save"><Save className="h-3 w-3" /></button>
      </div>
    </section>
  );
}

function GroupBlock(props: {
  section: LogSection;
  allSections: LogSection[];
  group: LogGroup;
  selected: Set<string>;
  onSelectToggle: (key: string) => void;
  onSetActual: (sectionId: string, groupId: string, itemIdx: number, setIdx: number, metric: Metric, value: number | null) => void;
  onToggleComplete: (sectionId: string, groupId: string, itemIdx: number, setIdx: number) => void;
  onToggleItemComplete: (sectionId: string, groupId: string, itemIdx: number) => void;
  onAddSet: (sectionId: string, groupId: string, itemIdx: number) => void;
  onRemoveSet: (sectionId: string, groupId: string, itemIdx: number, setIdx: number) => void;
  onItemRest: (sectionId: string, groupId: string, itemIdx: number, sec: number) => void;
  onGroupRest: (sectionId: string, groupId: string, key: "restAfterRoundSeconds" | "restWithinSeconds", sec: number) => void;
  onChangeKind: (sectionId: string, groupId: string, kind: LogGroup["kind"]) => void;
  onRemoveItem: (sectionId: string, groupId: string, itemIdx: number) => void;
  onMoveItem: (sectionId: string, groupId: string, itemIdx: number, dstSectionId: string) => void;
  onSwap: (groupId: string, itemIdx: number) => void;
  onSwapMetric: (sectionId: string, groupId: string, itemIdx: number, oldMetric: SwappableMetric, newMetric: SwappableMetric) => void;
  onToggleNotation: (sectionId: string, groupId: string, itemIdx: number, setIdx: number, tag: string) => void;
  onToggleItemNotation: (sectionId: string, groupId: string, itemIdx: number, tag: string) => void;
  onSuperset: (sectionId: string, groupId: string, itemIdx: number) => void;
  onStartRest: (seconds: number, label: string) => void;
  onCloneForward: (sectionId: string, groupId: string, itemIdx: number, setIdx: number) => void;
  onOpenWeightWheel: (sectionId: string, groupId: string, itemIdx: number, setIdx: number, current: number | null | undefined) => void;
  flashKey: string | null;
  voiceDeniedRef: React.MutableRefObject<boolean>;
}) {
  const { section, group, allSections } = props;
  const isGrouped = group.kind !== "single";
  return (
    <div className={`border ${isGrouped ? "border-foreground" : "hairline"} p-2`}>
      {isGrouped && (
        <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.16em] px-1 pb-2">
          <span className="font-bold">{group.kind}</span>
          <div className="flex items-center gap-2">
            <RestEditor label="Within" seconds={group.restWithinSeconds ?? appConfig.timer.defaults.withinSupersetSeconds} onChange={(s) => props.onGroupRest(section.id, group.id, "restWithinSeconds", s)} onStart={() => props.onStartRest(group.restWithinSeconds ?? appConfig.timer.defaults.withinSupersetSeconds, "Within")} />
            <RestEditor label="After round" seconds={group.restAfterRoundSeconds ?? appConfig.timer.defaults.afterSupersetSeconds} onChange={(s) => props.onGroupRest(section.id, group.id, "restAfterRoundSeconds", s)} onStart={() => props.onStartRest(group.restAfterRoundSeconds ?? appConfig.timer.defaults.afterSupersetSeconds, "After round")} />
            <button title="Convert to single" onClick={() => props.onChangeKind(section.id, group.id, "single")} className="text-muted-foreground hover:text-foreground"><Ungroup className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
      {group.items.map((item, idx) => (
        <ItemRow
          key={`${group.id}-${idx}`}
          section={section} allSections={allSections} group={group} item={item} idx={idx}
          selected={props.selected.has(keyOf(section.id, group.id, idx))}
          onSelectToggle={() => props.onSelectToggle(keyOf(section.id, group.id, idx))}
          onSetActual={(setIdx, metric, value) => props.onSetActual(section.id, group.id, idx, setIdx, metric, value)}
          onToggleComplete={(setIdx) => props.onToggleComplete(section.id, group.id, idx, setIdx)}
          onToggleItemComplete={() => props.onToggleItemComplete(section.id, group.id, idx)}
          onAddSet={() => props.onAddSet(section.id, group.id, idx)}
          onRemoveSet={(setIdx) => props.onRemoveSet(section.id, group.id, idx, setIdx)}
          onItemRest={(sec) => props.onItemRest(section.id, group.id, idx, sec)}
          onRemoveItem={() => props.onRemoveItem(section.id, group.id, idx)}
          onMoveItem={(dstSectionId) => props.onMoveItem(section.id, group.id, idx, dstSectionId)}
          onSwap={() => props.onSwap(group.id, idx)}
          onSwapMetric={(oldM, newM) => props.onSwapMetric(section.id, group.id, idx, oldM, newM)}
          onToggleNotation={(setIdx, tag) => props.onToggleNotation(section.id, group.id, idx, setIdx, tag)}
          onToggleItemNotation={(tag) => props.onToggleItemNotation(section.id, group.id, idx, tag)}
          onSuperset={() => props.onSuperset(section.id, group.id, idx)}
          onStartRest={props.onStartRest}
          onCloneForward={(setIdx) => props.onCloneForward(section.id, group.id, idx, setIdx)}
          onOpenWeightWheel={(setIdx, current) => props.onOpenWeightWheel(section.id, group.id, idx, setIdx, current)}
          rowFlashPrefix={`${section.id}::${group.id}::${idx}`}
          flashKey={props.flashKey}
          voiceDeniedRef={props.voiceDeniedRef}
        />
      ))}
    </div>
  );
}

function ItemRow(props: {
  section: LogSection;
  allSections: LogSection[];
  group: LogGroup;
  item: LogItem;
  idx: number;
  selected: boolean;
  onSelectToggle: () => void;
  onSetActual: (setIdx: number, metric: Metric, value: number | null) => void;
  onToggleComplete: (setIdx: number) => void;
  onToggleItemComplete: () => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
  onItemRest: (sec: number) => void;
  onRemoveItem: () => void;
  onMoveItem: (dstSectionId: string) => void;
  onSwap: () => void;
  onSwapMetric: (oldMetric: SwappableMetric, newMetric: SwappableMetric) => void;
  onToggleNotation: (setIdx: number, tag: string) => void;
  onToggleItemNotation: (tag: string) => void;
  onSuperset: () => void;
  onStartRest: (seconds: number, label: string) => void;
  onCloneForward: (setIdx: number) => void;
  onOpenWeightWheel: (setIdx: number, current: number | null | undefined) => void;
  rowFlashPrefix: string;
  flashKey: string | null;
  voiceDeniedRef: React.MutableRefObject<boolean>;
}) {
  const { item, section, allSections, selected, onSelectToggle, onStartRest } = props;
  const lp = useLongPress(onSelectToggle, undefined);
  const cols = METRIC_ORDER.filter((m) => item.metrics.includes(m));

  const totalSets = item.sets.length;
  const completedCount = item.sets.filter((s) => s.actual.completed).length;
  const allComplete = totalSets > 0 && completedCount === totalSets;
  const noneComplete = completedCount === 0;
  const lastIsComplete = totalSets > 0 && !!item.sets[totalSets - 1].actual.completed;
  // Show ghost row when last set just completed but not all sets are bulk-complete.
  const showGhostRow = lastIsComplete && !allComplete;

  const firstActiveSetIdx = item.sets.findIndex((s) => !s.actual.completed);

  return (
    <div className={`border-t hairline first:border-t-0 ${selected ? "bg-secondary" : ""}`}>
      <div className="flex items-center justify-between gap-2 py-2 px-1" {...lp}>
        <div className="flex flex-col min-w-0">
          <span className="font-display text-base tracking-[-0.03em] truncate">{item.name}</span>
          <MovementMeta item={item} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={props.onSwap}
            className="touch-target text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss"
            title="Swap movement"
            aria-label="Swap movement"
          >
            <Replace className="h-3.5 w-3.5" />
          </button>
          <RestEditor label="Rest" seconds={item.restBetweenSetsSeconds} onChange={props.onItemRest} onStart={() => onStartRest(item.restBetweenSetsSeconds, item.name)} compact />
          <Popover>
            <PopoverTrigger asChild>
              <button className="touch-target text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss" title="Options" aria-label="Options"><Settings2 className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              <button onClick={props.onSwap} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Replace className="h-3 w-3" /> Swap</button>
              <button onClick={props.onAddSet} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Plus className="h-3 w-3" /> Add set</button>
              <button onClick={props.onSuperset} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Group className="h-3 w-3" /> Superset with…</button>
              <TagsSubmenu item={item} onToggle={(tag) => props.onToggleItemNotation(tag)} />
              <MoveToSubmenu sections={allSections} currentSectionId={section.id} onMove={props.onMoveItem} />
              <button onClick={props.onRemoveItem} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Trash2 className="h-3 w-3" /> Remove</button>
            </PopoverContent>
          </Popover>
          <ItemCompleteCheckbox allComplete={allComplete} noneComplete={noneComplete} onClick={props.onToggleItemComplete} />
        </div>
      </div>

      <div className="overflow-x-auto edge-fade-x">
        <table className="ll-table min-w-[360px]">
          <thead>
            <tr>
              <th className="w-8">#</th>
              {cols.map((m) => (
                <th key={m} className="text-right">
                  {(SWAPPABLE as readonly string[]).includes(m) ? (
                    <SwapMetricHeader current={m as SwappableMetric} onSwap={(nm) => props.onSwapMetric(m as SwappableMetric, nm)} />
                  ) : (
                    appConfig.metrics.labels[m]
                  )}
                </th>
              ))}
              <th className="w-10"></th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {item.sets.flatMap((s, i) => {
                const prev = i > 0 ? item.sets[i - 1] : null;
                const cliff =
                  !!prev?.actual.completed && !!s.actual.completed &&
                  typeof prev.actual.weight === "number" && typeof s.actual.weight === "number" &&
                  prev.actual.weight === s.actual.weight &&
                  typeof prev.actual.reps === "number" && typeof s.actual.reps === "number" &&
                  (prev.actual.reps - s.actual.reps) > 2;
                const flashed = props.flashKey === `${props.rowFlashPrefix}::${i}`;
                const rows = [
                  <SetRow key={i} idx={i} set={s} cols={cols}
                    item={item}
                    isActive={i === firstActiveSetIdx}
                    flashed={flashed}
                    onChange={(m, v) => props.onSetActual(i, m, v)}
                    onToggleComplete={() => props.onToggleComplete(i)}
                    onRemove={() => props.onRemoveSet(i)}
                    onStartRest={() => onStartRest(s.restAfterSeconds ?? item.restBetweenSetsSeconds, `${item.name} · set ${i + 1}`)}
                    onCloneForward={() => props.onCloneForward(i)}
                    onOpenWeightWheel={() => props.onOpenWeightWheel(i, s.actual.weight ?? null)}
                    voiceDeniedRef={props.voiceDeniedRef}
                    cliff={false}
                  />,
                ];
                if (cliff) {
                  rows.push(
                    <tr key={`cliff-${i}`}>
                      <td colSpan={cols.length + 3} className="text-muted-foreground text-[0.6rem] uppercase tracking-[0.14em] py-1 px-1">
                        rep loss {i + 1} — extend rest or stop early?
                      </td>
                    </tr>
                  );
                }
                return rows;
              })}
            </AnimatePresence>
          </tbody>
        </table>
        {showGhostRow && (
          <button
            onClick={props.onAddSet}
            className="w-full border-t border-dashed hairline py-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="inline h-2.5 w-2.5 mr-1" /> add set
          </button>
        )}
      </div>
    </div>
  );
}

function ItemCompleteCheckbox({ allComplete, noneComplete, onClick }: { allComplete: boolean; noneComplete: boolean; onClick: () => void }) {
  const indeterminate = !allComplete && !noneComplete;
  return (
    <button
      onClick={onClick}
      className="touch-target relative"
      title={allComplete ? "Mark all incomplete" : "Mark all complete"}
      aria-label="Toggle all sets complete"
    >
      <span
        className={cn(
          "h-5 w-5 border flex items-center justify-center transition-colors",
          allComplete ? "bg-foreground border-foreground text-background" : "hairline",
        )}
      >
        {allComplete && <span className="text-[0.7rem] leading-none">✓</span>}
        {indeterminate && <span className="block h-0.5 w-2.5 bg-foreground" />}
      </span>
    </button>
  );
}

function MoveToSubmenu({ sections, currentSectionId, onMove }: { sections: LogSection[]; currentSectionId: string; onMove: (dstId: string) => void }) {
  const [open, setOpen] = useState(false);
  const others = sections.filter((s) => s.id !== currentSectionId);
  if (others.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"
      >
        <ArrowRightLeft className="h-3 w-3" /> Move to…
      </button>
      {open && (
        <div className="border-t hairline pl-2">
          {others.map((s) => (
            <button
              key={s.id}
              onClick={() => onMove(s.id)}
              className="w-full text-left px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.1em] hover:bg-secondary truncate"
            >
              → {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SwapMetricHeader({ current, onSwap }: { current: SwappableMetric; onSwap: (m: SwappableMetric) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors duration-slow ease-swiss border-b border-dashed hairline pb-0.5">
          {appConfig.metrics.labels[current]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground px-2 pt-1 pb-2">Track as</div>
        {SWAPPABLE.map((m) => (
          <button
            key={m}
            onClick={() => onSwap(m)}
            className={cn(
              "w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center justify-between",
              m === current && "bg-foreground text-background hover:bg-foreground",
            )}
          >
            <span>{appConfig.metrics.labels[m]}</span>
            <span className="opacity-60 text-[0.6rem]">{appConfig.metrics.units[m]}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function StepperInput(props: {
  value: number | null | undefined;
  step: number;
  placeholder?: string;
  prefilled?: boolean;
  clamp?: { min?: number; max?: number };
  onChange: (v: number | null) => void;
}) {
  const { value, step, placeholder, prefilled, clamp, onChange } = props;
  const decimals = step < 1 ? 1 : 0;
  const min = clamp?.min ?? 0;
  const max = clamp?.max ?? Number.POSITIVE_INFINITY;
  const cfg = appConfig.touch.scrub;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  // Pointer scrub state (refs to avoid re-render churn on every move)
  const pointerIdRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const refYRef = useRef(0);          // moves in increments of pxPerStep as steps fire
  const startValueRef = useRef(0);
  const accStepsRef = useRef(0);
  const engagedRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);

  const setValue = useCallback((next: number) => {
    const clamped = Math.min(max, Math.max(min, Number(next.toFixed(decimals))));
    onChange(clamped);
    return clamped;
  }, [onChange, decimals, min, max]);

  const haptic = (ms: number) => {
    if (appConfig.touch.hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch { /* noop */ }
    }
  };

  const engage = useCallback(() => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    setScrubbing(true);
    inputRef.current?.blur();
    haptic(cfg.hapticPerStepMs);
  }, [cfg.hapticPerStepMs]);

  const clearHold = () => {
    if (holdTimerRef.current) { window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cfg.enabled) return;
    if (pointerIdRef.current !== null) return; // ignore secondary pointers
    pointerIdRef.current = e.pointerId;
    startYRef.current = e.clientY;
    refYRef.current = e.clientY;
    // When empty, seed from a sensible in-range value so clamps don't strand the scrub.
    const seed = value ?? (Number.isFinite(min) ? min : 0);
    startValueRef.current = Math.min(max, Math.max(min, seed));
    accStepsRef.current = 0;
    engagedRef.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    holdTimerRef.current = window.setTimeout(() => { engage(); }, cfg.pressHoldMs);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    const dyTotal = e.clientY - startYRef.current;
    if (!engagedRef.current && Math.abs(dyTotal) > cfg.deadzonePx) {
      clearHold();
      engage();
    }
    if (!engagedRef.current) return;
    e.preventDefault();
    const dy = e.clientY - refYRef.current;
    const dirSign = cfg.invertY ? 1 : -1; // up (negative dy) => increase
    const stepsDelta = Math.trunc(dy / cfg.pxPerStep) * dirSign * -1;
    // Note: we want up=increase. dy<0 (moved up) => stepsDelta>0.
    // Compute as: steps = trunc(-dy / pxPerStep) when invertY=false.
    const steps = Math.trunc((cfg.invertY ? dy : -dy) / cfg.pxPerStep);
    if (steps !== 0) {
      accStepsRef.current += steps;
      refYRef.current += steps * cfg.pxPerStep * (cfg.invertY ? 1 : -1);
      const next = startValueRef.current + accStepsRef.current * step;
      setValue(next);
      haptic(cfg.hapticPerStepMs);
    }
    // Suppress unused warning
    void stepsDelta;
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    clearHold();
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
    pointerIdRef.current = null;
    if (engagedRef.current) {
      engagedRef.current = false;
      setScrubbing(false);
    }
  };

  useEffect(() => () => clearHold(), []);

  // Keyboard a11y: arrow keys still adjust like a native spinbutton
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") { e.preventDefault(); setValue((value ?? 0) + step); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setValue((value ?? 0) - step); }
  };

  return (
    <motion.div
      className={cn("relative inline-block select-none", scrubbing && "scrubbing")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      animate={{ scale: scrubbing ? cfg.magnifyScale : 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      style={{ transformOrigin: "right center" }}
    >
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        pattern="[0-9]*\.?[0-9]*"
        step={step}
        value={value ?? ""}
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuenow={value ?? undefined}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") { onChange(null); return; }
          const n = Number(v);
          if (Number.isNaN(n)) return;
          setValue(n);
        }}
        readOnly={scrubbing}
        className={cn(
          "w-16 text-right bg-transparent border-b hairline focus:border-foreground focus:outline-none transition-colors duration-slow ease-swiss font-mono no-zoom-input py-1",
          scrubbing && "border-foreground",
          prefilled && "italic text-muted-foreground",
        )}
        placeholder={placeholder}
      />
    </motion.div>
  );
}

function SetRow(props: {
  idx: number;
  set: LogSet;
  cols: Metric[];
  item: LogItem;
  isActive: boolean;
  flashed: boolean;
  onChange: (m: Metric, v: number | null) => void;
  onToggleComplete: () => void;
  onRemove: () => void;
  onStartRest: () => void;
  onCloneForward: () => void;
  onOpenWeightWheel: () => void;
  voiceDeniedRef: React.MutableRefObject<boolean>;
  cliff?: boolean;
}) {
  const { idx, set, cols } = props;
  const REVEAL = appConfig.touch.swipe.revealPx;
  const REVEAL_SNAP = REVEAL / 2;
  const DELETE_THRESHOLD = appConfig.touch.swipe.deleteThresholdPx;
  const VELOCITY_DELETE = appConfig.touch.swipe.velocityDeletePxPerSec;
  const HAPTIC_MS = appConfig.touch.swipe.hapticMs;
  const x = useMotionValue(0);
  const actionOpacity = useTransform(x, [-REVEAL, -REVEAL_SNAP, 0], [1, 0.6, 0]);
  const labelOpacity = useTransform(x, [-REVEAL, -REVEAL * 0.85], [1, 0]);
  const spring = { type: "spring" as const, stiffness: 500, damping: 40 };
  const voice = useVoiceInput();
  const cloneLp = useLongPress(props.onCloneForward, undefined);
  const [repsOpen, setRepsOpen] = useState(false);

  function onDragEnd(_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const ox = info.offset.x;
    const vx = info.velocity.x;
    if (ox <= -DELETE_THRESHOLD || vx < -VELOCITY_DELETE) {
      if (appConfig.touch.hapticsEnabled) try { navigator.vibrate?.(HAPTIC_MS); } catch { /* noop */ }
      animate(x, -600, { duration: 0.18, ease: [0.4, 0, 0.2, 1] });
      props.onRemove();
      return;
    }
    if (ox <= -REVEAL_SNAP) {
      if (appConfig.touch.hapticsEnabled) try { navigator.vibrate?.(HAPTIC_MS); } catch { /* noop */ }
      animate(x, -REVEAL, spring);
    } else {
      animate(x, 0, spring);
    }
  }

  function deleteFromButton() {
    animate(x, -600, { duration: 0.18, ease: [0.4, 0, 0.2, 1] });
    props.onRemove();
  }

  async function handleVoice() {
    if (props.voiceDeniedRef.current) return;
    try {
      const text = await voice.start();
      const m = text.match(/(\d+(?:\.\d+)?)\s*(?:by|x|×|at)\s*(\d+)/i);
      const isAmrap = props.set.planned?.reps === "max";
      if (m) {
        const w = Number(m[1]);
        const r = Number(m[2]);
        if (props.cols.includes("weight")) props.onChange("weight", w);
        if (props.cols.includes("reps") && !isAmrap) props.onChange("reps", r);
      } else if (isAmrap) {
        const m2 = text.match(/(\d+)/);
        if (m2) props.onChange("reps", Number(m2[1]));
        else { toast(`Couldn't catch that — try "120 by 5"`); return; }
      } else {
        toast(`Couldn't catch that — try "120 by 5"`);
      }
    } catch (e) {
      const err = (e as Error).message;
      if (err === "not-allowed") {
        props.voiceDeniedRef.current = true;
        toast.error("Microphone permission denied");
      }
    }
  }

  return (
    <motion.tr
      layout
      initial={false}
      exit={{ opacity: 0, x: -400, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
      className={cn("relative swipe-row", set.actual.completed && "opacity-60")}
      style={{ x }}
      animate={props.flashed ? { scale: [1, 1.03, 1] } : undefined}
      transition={props.flashed ? { duration: 0.2 } : undefined}
      drag="x"
      dragConstraints={{ left: -REVEAL, right: 0 }}
      dragElastic={{ left: 0.4, right: 0 }}
      dragMomentum={false}
      onDragEnd={onDragEnd}
    >
      <td
        className="font-mono text-xs select-none cursor-pointer"
        title={set.actual.completed ? "Long-press to copy forward" : undefined}
        {...(set.actual.completed ? cloneLp : {})}
      >
        <span className="inline-flex items-center gap-0.5">
          {idx + 1}
          {set.actual.completed && <ChevronDown className="h-3 w-3 opacity-30" />}
        </span>
      </td>
      {cols.map((m) => {
        const step = m === "rpe" || m === "weight" ? 0.5 : 1;
        if (m === "weight") {
          return (
            <td key={m} className="text-right">
              <button
                onClick={props.onOpenWeightWheel}
                className={cn(
                  "w-16 text-right bg-transparent border-b hairline hover:border-foreground transition-colors duration-slow ease-swiss font-mono py-1 inline-block",
                  set.actual.prefilled && "italic text-muted-foreground",
                )}
                aria-label="Set weight"
              >
                {typeof set.actual.weight === "number" ? (set.actual.weight % 1 === 0 ? set.actual.weight.toFixed(0) : set.actual.weight.toFixed(1)) : "0"}
              </button>
            </td>
          );
        }
        if (m === "reps") {
          const isAmrap = set.planned?.reps === "max";
          const plannedNum = typeof set.planned?.reps === "number" ? (set.planned.reps as number) : null;
          const max = isAmrap ? Infinity : (plannedNum != null ? plannedNum + 5 : Infinity);
          const display = typeof set.actual.reps === "number"
            ? String(set.actual.reps)
            : (isAmrap ? "max" : "0");
          return (
            <td key={m} className="text-right">
              <RepsStepper
                open={repsOpen}
                onOpenChange={setRepsOpen}
                value={typeof set.actual.reps === "number" ? set.actual.reps : null}
                max={max}
                onCommit={(v) => props.onChange("reps", v)}
                trigger={
                  <button
                    type="button"
                    className={cn(
                      "w-16 text-right bg-transparent border-b hairline hover:border-foreground transition-colors duration-slow ease-swiss font-mono py-1 inline-block",
                      set.actual.prefilled && "italic text-muted-foreground",
                    )}
                    aria-label="Set reps"
                  >
                    {display}
                  </button>
                }
              />
            </td>
          );
        }
        return (
          <td key={m} className="text-right">
            <StepperInput
              value={set.actual[m] as number | null | undefined}
              step={step}
              prefilled={set.actual.prefilled}
              placeholder="—"
              clamp={m === "rpe" ? { min: appConfig.rpe.min, max: appConfig.rpe.max } : { min: 0 }}
              onChange={(v) => props.onChange(m, v)}
            />
          </td>
        );
      })}
      <td className="text-right">
        <div className="flex items-center justify-end gap-1">
          {props.isActive && voice.supported && !props.voiceDeniedRef.current && (
            <motion.button
              onClick={handleVoice}
              className="text-muted-foreground hover:text-foreground"
              animate={voice.listening ? { scale: [1, 1.15, 1] } : undefined}
              transition={voice.listening ? { repeat: Infinity, duration: 1 } : undefined}
              aria-label="Voice input"
              title='Say "120 by 5"'
            >
              <Mic className="h-3.5 w-3.5" />
            </motion.button>
          )}
          <button
            onClick={props.onStartRest}
            className="text-[0.6rem] uppercase tracking-[0.12em] border hairline px-1.5 py-0.5 hover:bg-secondary transition-colors duration-slow ease-swiss"
            title="Start rest"
          >
            rest
          </button>
        </div>
      </td>
      <td className="text-right relative">
        <button
          onClick={props.onToggleComplete}
          className="touch-target-sm"
          aria-label="Toggle complete"
        >
          <span className={cn("h-4 w-4 border block", set.actual.completed ? "bg-foreground border-foreground" : "hairline")} />
        </button>
        <motion.div
          className="absolute top-0 left-full h-full flex items-center justify-center pointer-events-none"
          style={{ width: REVEAL, backgroundColor: "hsl(0 65% 42%)", opacity: actionOpacity }}
        >
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); deleteFromButton(); }}
            className="text-background h-full w-full flex items-center justify-center gap-1.5 pointer-events-auto hover:bg-black/10 transition-colors"
            aria-label="Delete set"
          >
            <Trash2 className="h-4 w-4" />
            <motion.span
              style={{ opacity: labelOpacity }}
              className="text-[0.65rem] uppercase tracking-[0.12em] font-bold"
            >
              Delete
            </motion.span>
          </button>
        </motion.div>
      </td>
    </motion.tr>
  );
}

function RestEditor(props: { label: string; seconds: number; onChange: (s: number) => void; onStart: () => void; compact?: boolean }) {
  const { label, seconds, onChange, onStart, compact } = props;
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button className={`border hairline px-1.5 py-0.5 font-mono text-[0.65rem] hover:bg-secondary transition-colors duration-slow ease-swiss`}>
            {compact ? fmt(seconds) : `${label} ${fmt(seconds)}`}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">{label}</div>
          <div className="flex flex-wrap gap-1">
            {appConfig.timer.presets.map((p) => (
              <button key={p} onClick={() => onChange(p)}
                className={`text-[0.6rem] font-mono px-2 py-1 border ${seconds === p ? "bg-foreground text-background border-foreground" : "hairline"}`}>
                {fmt(p)}
              </button>
            ))}
          </div>
          <input
            type="number" min={0} step={5} value={seconds}
            onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
            className="mt-2 w-full bg-transparent border-b hairline focus:border-foreground focus:outline-none py-1 font-mono text-sm"
          />
        </PopoverContent>
      </Popover>
      <button onClick={onStart} className="border hairline px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] hover:bg-foreground hover:text-background transition-colors duration-slow ease-swiss">go</button>
    </div>
  );
}

function RestOverlay(props: { targetSeconds: number; label: string; onClose: () => void }) {
  const cd = useCountdown(props.targetSeconds);
  useEffect(() => { cd.start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    if (cd.seconds === 0) {
      const t = window.setTimeout(() => props.onClose(), 1500);
      return () => window.clearTimeout(t);
    }
  }, [cd.seconds, props]);
  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center p-6">
      <div className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">{props.label}</div>
      <div className="font-mono text-[6rem] sm:text-[8rem] tabular-nums leading-none mt-3">{fmt(cd.seconds)}</div>
      <div className="mt-6 flex gap-2">
        {!cd.running ? (
          <button onClick={cd.start} className="ll-btn flex items-center gap-1"><Play className="h-3 w-3" /> Start</button>
        ) : (
          <button onClick={cd.stop} className="ll-btn flex items-center gap-1"><Pause className="h-3 w-3" /> Pause</button>
        )}
        <button onClick={() => cd.reset()} className="ll-btn flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Reset</button>
        <button onClick={() => cd.setSeconds(Math.max(0, cd.seconds - 15))} className="ll-btn">-15</button>
        <button onClick={() => cd.setSeconds(cd.seconds + 15)} className="ll-btn">+15</button>
        <button onClick={props.onClose} className="ll-btn flex items-center gap-1"><X className="h-3 w-3" /> Close</button>
      </div>
    </div>
  );
}

/** Compressed Warm-up section: collapsed by default, single-line items, no per-set timers/grids. */
function CompactWarmupSection(props: {
  section: LogSection;
  freeText?: string;
  onToggleItemComplete: (sectionId: string, groupId: string, itemIdx: number) => void;
  onRemoveItem: (sectionId: string, groupId: string, itemIdx: number) => void;
  onAddMovement: () => void;
}) {
  const { section, freeText } = props;
  const totalMvts = section.groups.reduce((n, g) => n + g.items.length, 0);
  const totalSets = section.groups.reduce((n, g) => n + g.items.reduce((m, it) => m + it.sets.length, 0), 0);

  function summarizeSets(it: LogItem): string {
    const sets = it.sets;
    if (sets.length === 0) return "—";
    const planned = sets[0]?.planned;
    if (planned?.raw) return `${sets.length}× ${planned.raw}`;
    const reps = sets.map((s) => s.actual.reps ?? s.planned?.reps).filter((v) => v != null);
    if (reps.length === sets.length) return `${sets.length}× ${reps[0]}`;
    return `${sets.length} sets`;
  }

  return (
    <AccordionItem value={section.id} className="border-b hairline border-dashed bg-muted/30">
      <AccordionTrigger className="py-1.5 px-2 hover:no-underline">
        <div className="flex items-baseline gap-3 w-full">
          <span className="font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">Warm-up</span>
          <span className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground">
            {totalMvts} mvts · {totalSets} sets
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3 px-2">
        {freeText && (
          <div className="text-[0.7rem] italic text-muted-foreground mb-2">{freeText}</div>
        )}
        <ul className="space-y-1">
          {section.groups.map((group) =>
            group.items.map((it, i) => {
              const allDone = it.sets.length > 0 && it.sets.every((s) => s.actual.completed);
              return (
                <li key={`${group.id}-${i}`} className="flex items-center justify-between gap-2 text-xs py-1 border-b hairline last:border-b-0">
                  <button
                    onClick={() => props.onToggleItemComplete(section.id, group.id, i)}
                    className={cn("flex-1 text-left flex items-center gap-2", allDone && "text-muted-foreground line-through")}
                  >
                    <span className={cn("inline-block h-3 w-3 border hairline shrink-0", allDone && "bg-foreground")} />
                    <span className="font-display tracking-[-0.02em] truncate">{it.name}</span>
                  </button>
                  <span className="font-mono text-[0.65rem] text-muted-foreground shrink-0">{summarizeSets(it)}</span>
                  <button
                    onClick={() => props.onRemoveItem(section.id, group.id, i)}
                    className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="Remove movement"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <button
          onClick={props.onAddMovement}
          className="mt-2 w-full border border-dashed hairline py-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary transition-colors"
        >
          <Plus className="inline h-3 w-3 mr-1" /> Add warm-up movement
        </button>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Modal: pick another movement (in the same section) to superset with, or add a new one. */
function SupersetPicker(props: {
  doc: LogDocument;
  target: { sectionId: string; groupId: string; itemIndex: number };
  onClose: () => void;
  onPickExisting: (src: { sectionId: string; groupId: string; itemIndex: number }) => void;
  onPickNew: () => void;
}) {
  const { doc, target } = props;
  const section = doc.sections.find((s) => s.id === target.sectionId);
  const targetGroup = section?.groups.find((g) => g.id === target.groupId);
  const candidates: { srcSectionId: string; groupId: string; itemIndex: number; name: string }[] = [];
  if (section) {
    for (const g of section.groups) {
      g.items.forEach((it, i) => {
        if (g.id === target.groupId && i === target.itemIndex) return;
        if (targetGroup && g.id === target.groupId) return; // already in same group
        candidates.push({ srcSectionId: section.id, groupId: g.id, itemIndex: i, name: it.name });
      });
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-background/90 flex items-center justify-center p-4" onClick={props.onClose}>
      <div className="bg-background border-2 border-foreground w-full max-w-sm max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 border-b hairline flex items-center justify-between">
          <span className="font-display text-sm uppercase tracking-[-0.03em]">Superset with…</span>
          <button onClick={props.onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="px-3 py-4 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              No other movements in this section yet.
            </div>
          ) : (
            <ul className="divide-y hairline">
              {candidates.map((c) => (
                <li key={`${c.groupId}-${c.itemIndex}`}>
                  <button
                    onClick={() => props.onPickExisting({ sectionId: c.srcSectionId, groupId: c.groupId, itemIndex: c.itemIndex })}
                    className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors"
                  >
                    <div className="font-display text-sm tracking-[-0.03em] truncate">{c.name}</div>
                    <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">{section?.name}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={props.onPickNew}
          className="border-t-2 border-foreground py-3 text-xs uppercase tracking-[0.14em] hover:bg-secondary transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-3 w-3" /> New movement
        </button>
      </div>
    </div>
  );
}
