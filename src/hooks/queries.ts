/** Centralized React Query hooks for all Supabase reads. */
import { useQuery } from "@tanstack/react-query";
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
};

export type LogRowWithData = LogRow & { data?: LogDocument };

export type PlanLogRow = {
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
        .select("id,log_date,day_key,status,total_seconds,tags,activity_type,created_at")
        .eq("owner_user_id", userId!)
        .in("status", ["done", "in_progress"])
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LogRow[];
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
        .select("week_number,day_key,data,status")
        .eq("owner_user_id", userId!)
        .eq("status", "done")
        .order("log_date", { ascending: false })
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
        .select("id,log_date,day_key,status,total_seconds,tags,activity_type")
        .eq("owner_user_id", userId!)
        .neq("status", "cancelled")
        .gte("log_date", monthStart)
        .lte("log_date", monthEnd)
        .order("log_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CalendarLogRow[];
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