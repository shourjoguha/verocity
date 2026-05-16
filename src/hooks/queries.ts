/** Centralized React Query hooks for all Supabase reads. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ParsedPlan, LogDocument } from "@/lib/types";

export type ActivePlanRow = {
  id: string;
  name: string;
  parsed: ParsedPlan;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

export type LogRow = {
  id: string;
  log_date: string;
  day_key: string | null;
  status: string;
  total_seconds: number | null;
  tags: string[] | null;
  activity_type: string | null;
  data?: LogDocument;
};

export type LogRowWithData = LogRow & { data?: LogDocument };

export type PlanLogRow = {
  log_date: string;
  week_number: number | null;
  day_key: string | null;
  data: LogDocument;
  status: string;
};

export type CalendarLogRow = LogRow;

export type AdoptablePlan = {
  id: string;
  name: string;
  owner_user_id: string;
  parsed: ParsedPlan;
  source_markdown: string | null;
  start_date: string | null;
  end_date: string | null;
  ownerName?: string;
};

export type MovementRow = {
  id: string;
  name: string;
  category: string | null;
  tags: string[] | null;
  default_metrics: string[] | null;
  primary_metric: string | null;
  default_rest_seconds: number | null;
  owner_user_id: string | null;
};

export const qk = {
  activePlan: (userId?: string | null) => ["plan", "active", userId] as const,
  recentLogs: (userId?: string | null, limit = 5) => ["logs", "recent", userId, limit] as const,
  allLogs: (userId?: string | null) => ["logs", "all", userId] as const,
  doneLogsForPlan: (userId?: string | null) => ["logs", "done-for-plan", userId] as const,
  statsLogs: (userId?: string | null) => ["logs", "stats", userId] as const,
  monthLogs: (userId: string | null | undefined, start: string, end: string) =>
    ["logs", "month", userId, start, end] as const,
  movements: (ownerId?: string | null) => ["movements", ownerId] as const,
  adoptablePlans: (userId?: string | null) => ["plans", "adoptable", userId] as const,
  recommendations: (userId?: string | null) => ["recommendations", userId] as const,
  recommendation: (id?: string | null) => ["recommendation", id] as const,
  recentDoneLogs: (userId?: string | null) => ["logs", "recent-done", userId] as const,
};

export function useActivePlan(userId?: string | null) {
  return useQuery({
    queryKey: qk.activePlan(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ActivePlanRow | null> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,name,parsed,start_date,end_date,is_active")
        .eq("owner_user_id", userId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ActivePlanRow) ?? null;
    },
  });
}

export function useRecentLogs(userId?: string | null, limit = 5) {
  return useQuery({
    queryKey: qk.recentLogs(userId, limit),
    enabled: !!userId,
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id,log_date,day_key,status,total_seconds,tags,activity_type,data,created_at")
        .eq("owner_user_id", userId!)
        .in("status", ["done", "in_progress"])
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as LogRow[];
    },
  });
}

export function useAllUserLogs(userId?: string | null) {
  return useQuery({
    queryKey: qk.allLogs(userId),
    enabled: !!userId,
    queryFn: async (): Promise<LogRowWithData[]> => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id,log_date,day_key,status,total_seconds,tags,activity_type,data,created_at")
        .eq("owner_user_id", userId!)
        .neq("status", "cancelled")
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as LogRowWithData[];
    },
  });
}

export function useDoneLogsForPlan(userId?: string | null) {
  return useQuery({
    queryKey: qk.doneLogsForPlan(userId),
    enabled: !!userId,
    queryFn: async (): Promise<PlanLogRow[]> => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("log_date,week_number,day_key,data,status")
        .eq("owner_user_id", userId!)
        .eq("status", "done")
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as PlanLogRow[];
    },
  });
}

export function useStatsLogs(userId?: string | null) {
  return useQuery({
    queryKey: qk.statsLogs(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id,log_date,status,total_seconds,data")
        .eq("owner_user_id", userId!)
        .order("log_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string; log_date: string; status: string; total_seconds: number | null; data: LogDocument;
      }[];
    },
  });
}

export function useMonthLogs(userId: string | null | undefined, monthStart: string, monthEnd: string) {
  return useQuery({
    queryKey: qk.monthLogs(userId, monthStart, monthEnd),
    enabled: !!userId,
    queryFn: async (): Promise<CalendarLogRow[]> => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id,log_date,day_key,status,total_seconds,tags,activity_type,data")
        .eq("owner_user_id", userId!)
        .neq("status", "cancelled")
        .gte("log_date", monthStart)
        .lte("log_date", monthEnd)
        .order("log_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as CalendarLogRow[];
    },
  });
}

export function useMovements(ownerId?: string | null) {
  return useQuery({
    queryKey: qk.movements(ownerId),
    enabled: true,
    queryFn: async (): Promise<MovementRow[]> => {
      const filter = `owner_user_id.is.null${ownerId ? `,owner_user_id.eq.${ownerId}` : ""}`;
      const { data, error } = await supabase
        .from("movements")
        .select("id,name,category,tags,default_metrics,primary_metric,default_rest_seconds,owner_user_id")
        .or(filter)
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MovementRow[];
    },
  });
}

export function useAdoptablePlans(userId?: string | null, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.adoptablePlans(userId),
    enabled: !!userId && (opts?.enabled ?? true),
    queryFn: async (): Promise<AdoptablePlan[]> => {
      const { data: plans, error } = await supabase
        .from("plans")
        .select("id,name,owner_user_id,parsed,source_markdown,start_date,end_date")
        .neq("owner_user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (plans ?? []) as unknown as AdoptablePlan[];
      const ownerIds = Array.from(new Set(list.map((p) => p.owner_user_id)));
      if (ownerIds.length === 0) return list.map((p) => ({ ...p, ownerName: "anonymous" }));
      const { data: users, error: uErr } = await supabase
        .from("app_users")
        .select("id,display_name")
        .in("id", ownerIds);
      if (uErr) throw uErr;
      const nameMap = new Map((users ?? []).map((u) => [u.id, u.display_name]));
      return list.map((p) => ({ ...p, ownerName: nameMap.get(p.owner_user_id) ?? "anonymous" }));
    },
  });
}
/* ---------------- Recommendations ---------------- */

export type RecommendationRow = {
  id: string;
  owner_user_id: string;
  domain: string;
  created_at: string;
  tldr: string;
  action: string;
  drift_score: number | null;
  confidence: number;
  status: string;
  acted_disposition: string | null;
  acted_at: string | null;
  subjective_fit_1_5: number | null;
  outcome_note: string | null;
  snoozed_until: string | null;
  snooze_count: number;
  block_week: number | null;
  next_session_id: string | null;
};

export type RecommendationFull = RecommendationRow & {
  body_md: string | null;
  rx_md_path: string;
  goal_ref: string;
  trigger_type: string;
  signals_fired: unknown;
  source_refs: unknown;
};

export function useRecommendations(userId?: string | null) {
  return useQuery({
    queryKey: qk.recommendations(userId),
    enabled: !!userId,
    queryFn: async (): Promise<RecommendationRow[]> => {
      const sinceIso = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("recommendations")
        .select("id, domain, owner_user_id, created_at, drift_score, confidence, status, tldr, action, acted_disposition, acted_at, subjective_fit_1_5, outcome_note, snoozed_until, snooze_count, block_week, next_session_id")
        .eq("owner_user_id", userId!)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as RecommendationRow[];
    },
  });
}

export function useRecommendation(id?: string | null, userId?: string | null) {
  return useQuery({
    queryKey: qk.recommendation(id),
    enabled: !!id && !!userId,
    queryFn: async (): Promise<RecommendationFull | null> => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("*")
        .eq("id", id!)
        .eq("owner_user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as RecommendationFull) ?? null;
    },
  });
}

export type DispositionInput = {
  recId: string;
  userId: string;
  status: "acted" | "dismissed";
  acted_disposition: "acted_as_prescribed" | "acted_modified" | "skipped";
  subjective_fit_1_5: number | null;
  next_session_id: string | null;
  outcome_note: string | null;
  prevSnoozeCount: number;
};

export function useDispositionRec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: DispositionInput) => {
      const { error } = await supabase
        .from("recommendations")
        .update({
          status: args.status,
          acted_disposition: args.acted_disposition,
          acted_at: new Date().toISOString(),
          subjective_fit_1_5: args.subjective_fit_1_5,
          next_session_id: args.next_session_id,
          outcome_note: args.outcome_note,
        })
        .eq("id", args.recId)
        .eq("owner_user_id", args.userId)
        .is("acted_at", null);
      if (error) throw error;
      return args;
    },
    onSuccess: (args) => {
      qc.invalidateQueries({ queryKey: qk.recommendations(args.userId) });
      qc.invalidateQueries({ queryKey: qk.recommendation(args.recId) });
    },
  });
}

export type SnoozeInput = {
  recId: string;
  userId: string;
  days: number;
  prevSnoozeCount: number;
};

export function useSnoozeRec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SnoozeInput) => {
      const days = Math.min(Math.max(args.days, 1), 7);
      const until = new Date(Date.now() + days * 86_400_000).toISOString();
      const newCount = (args.prevSnoozeCount ?? 0) + 1;
      const { error } = await supabase
        .from("recommendations")
        .update({
          status: "snoozed",
          snoozed_until: until,
          snooze_count: newCount,
        })
        .eq("id", args.recId)
        .eq("owner_user_id", args.userId);
      if (error) throw error;
      return { ...args, newCount };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.recommendations(res.userId) });
      qc.invalidateQueries({ queryKey: qk.recommendation(res.recId) });
    },
  });
}

export type RecentDoneLog = { id: string; log_date: string; day_key: string | null };

export function useRecentDoneLogs(userId?: string | null, limit = 20) {
  return useQuery({
    queryKey: qk.recentDoneLogs(userId),
    enabled: !!userId,
    queryFn: async (): Promise<RecentDoneLog[]> => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id, log_date, day_key")
        .eq("owner_user_id", userId!)
        .eq("status", "done")
        .order("log_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as RecentDoneLog[];
    },
  });
}
