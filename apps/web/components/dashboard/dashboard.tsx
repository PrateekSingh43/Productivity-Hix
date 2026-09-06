"use client";

import { useQueryClient } from "@tanstack/react-query";
import { TopHeader } from "../layout/top-header";
import { DailyHero } from "../overview/daily-hero";
import { CurrentSession } from "../overview/current-session";
import { LiveActivityCard } from "../overview/live-activity-card";
import { TodayProgress } from "../overview/today-progress";
import { TodayTasks } from "../overview/today-tasks";
import { CheckInCard } from "../overview/check-in-card";
import { InsightsSection } from "../overview/insights-section";
import { LearningSnapshot } from "../overview/learning-snapshot";
import {
  useActivitySummary,
  useDailyAnalytics,
  useTasks,
} from "../../src/hooks/queries/use-dashboard";
import { createTask } from "../../src/lib/api/tasks";

export function Dashboard() {
  const queryClient = useQueryClient();
  const tasksQuery = useTasks();
  const activityQuery = useActivitySummary();
  const analyticsQuery = useDailyAnalytics();

  const tasks = tasksQuery.data ?? [];
  const completedTasks = tasks.filter((t) => t.status === "done");

  const handleAddTask = async (title: string) => {
    try {
      await createTask({ title });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch {
      // Handled silently
    }
  };

  return (
    <div className="min-h-screen bg-[#08090b] text-[#f4f4f6] flex flex-col pb-20">
      {/* Top Header */}
      <TopHeader title="Overview" />

      {/* Main Container - Perfectly aligned max-width */}
      <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-8 py-8 space-y-7">
        
        {/* Daily Summary / Hero */}
        <DailyHero
          activity={activityQuery.data}
          analytics={analyticsQuery.data}
          completedTasksCount={completedTasks.length}
          totalTasksCount={tasks.length}
        />

        {/* Two Column Balanced Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          
          {/* Primary Column (Work & Execution - 7 cols) */}
          <div className="lg:col-span-7 space-y-7">
            {/* Current Active Session */}
            <CurrentSession />

            {/* Live Activity (Human-facing, clean telemetry) */}
            <LiveActivityCard />

            {/* Today's Progress & Timeline Distribution */}
            <TodayProgress activity={activityQuery.data} />

            {/* Today's Work / Priorities */}
            <TodayTasks
              tasks={tasks}
              onAddTask={handleAddTask}
            />
          </div>

          {/* Secondary Column (Reflection & Intelligence - 5 cols) */}
          <div className="lg:col-span-5 space-y-7">
            {/* Contextual Check-in */}
            <CheckInCard />

            {/* Behavioral Insights & Next Actions */}
            <InsightsSection
              analytics={analyticsQuery.data}
            />

            {/* Learning Snapshot */}
            <LearningSnapshot />
          </div>

        </div>

      </div>
    </div>
  );
}
