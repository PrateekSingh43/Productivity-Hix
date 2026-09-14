import type { BaselinePopulationProvider, HistoricalWindow } from "../source";
import type { TaskWithSessions } from "@repo/types";

export interface TaskDataSource {
  /**
   * Fetches completed tasks strictly within [startUTC, endUTC) for the given user.
   * Implementation must enforce the userId isolation and temporal boundaries.
   */
  findCompletedTasks(userId: string, startUTC: string, endUTC: string): Promise<TaskWithSessions[]>;
}

/**
 * Concrete provider for historical completed task episodes.
 * Adapts an existing canonical historical source (e.g. Postgres Tasks) 
 * into a strongly typed BaselinePopulationProvider.
 */
export class CompletedTaskProvider implements BaselinePopulationProvider<TaskWithSessions> {
  readonly populationType = "completed_task_episodes";

  constructor(private readonly dataSource: TaskDataSource) {}

  async fetchPopulation(userId: string, window: HistoricalWindow): Promise<TaskWithSessions[]> {
    return this.dataSource.findCompletedTasks(userId, window.start, window.end);
  }
}
