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
 * Concrete provider for historical completed tasks.
 * Note: This provider is an upstream historical Task source adapter only.
 * It does not construct Phase-4 D2 task episodes. It serves merely as an
 * interface boundary proving the architecture works end-to-end.
 */
export class CompletedTasksAdapter implements BaselinePopulationProvider<TaskWithSessions> {
  readonly populationType = "completed_tasks";

  constructor(private readonly dataSource: TaskDataSource) {}

  async fetchPopulation(userId: string, window: HistoricalWindow): Promise<TaskWithSessions[]> {
    return this.dataSource.findCompletedTasks(userId, window.start, window.end);
  }
}
