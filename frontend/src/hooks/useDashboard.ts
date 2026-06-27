import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";

export interface NutrientBreakdown {
  nutrient: string;
  avg: number;
  rda: number;
  pct: number;
  weight: number;
  status: "good" | "low" | "deficient";
}

export interface DashboardData {
  score: number;
  has_data: boolean;
  message?: string;
  nutrient_averages: Record<string, number>;
  breakdown: NutrientBreakdown[];
  deficiencies: string[];
  streak: number;
  seasonal_compliance: number;
  current_season: string;
  days_logged: number;
  calorie_by_date: Record<string, number>;
  logged_foods: string[];
}

export interface MealLogEntry {
  id: number;
  logged_date: string;
  meal_slot: string;
  amount_g: number;
  name: string;
  calories_per_100g: number;
  category: string;
  image_url?: string;
}

export interface TodayLog {
  date: string;
  logs: MealLogEntry[];
  total_calories: number;
}

export interface WeekLog {
  logs: MealLogEntry[];
}

export function useDashboard(profileId: string) {
  const [dashboard, setDashboard]   = useState<DashboardData | null>(null);
  const [todayLog,  setTodayLog]    = useState<TodayLog | null>(null);
  const [weekLog,   setWeekLog]     = useState<WeekLog | null>(null);
  const [loading,   setLoading]     = useState(true);
  const [error,     setError]       = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      const [scoreRes, todayRes, weekRes] = await Promise.all([
        apiClient.get<DashboardData>(`/nutrition-score/${profileId}`),
        apiClient.get<TodayLog>(`/meals/today/${profileId}`),
        apiClient.get<WeekLog>(`/meals/week/${profileId}`),
      ]);
      setDashboard(scoreRes.data);
      setTodayLog(todayRes.data);
      setWeekLog(weekRes.data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { refresh(); }, [refresh]);

  const deleteMeal = useCallback(async (logId: number) => {
    try {
      await apiClient.delete(`/meals/${logId}`);
      await refresh();
    } catch { /* ignore */ }
  }, [refresh]);

  return { dashboard, todayLog, weekLog, loading, error, refresh, deleteMeal };
}