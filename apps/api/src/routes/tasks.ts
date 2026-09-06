import { Router } from "express";
import { taskCreateSchema, taskUpdateSchema } from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import {
  createTask,
  listTasks,
  getTask,
  getTaskObservedActivity,
  updateTask,
  deleteTask,
} from "../services/tasks/service";

export const tasksRouter: Router = Router();
tasksRouter.use(requireAuth);

tasksRouter.get("/", async (request, response, next) => {
  try {
    response.json(await listTasks(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});

tasksRouter.get("/:id", async (request, response, next) => {
  try {
    const task = await getTask(userIdFrom(request), request.params.id);
    if (!task) {
      response.status(404).json({ error: "Task not found" });
      return;
    }
    response.json(task);
  } catch (error) {
    next(error);
  }
});

tasksRouter.get("/:id/activity", async (request, response, next) => {
  try {
    const activities = await getTaskObservedActivity(userIdFrom(request), request.params.id);
    response.json(activities);
  } catch (error) {
    next(error);
  }
});

tasksRouter.post("/", async (request, response, next) => {
  try {
    response
      .status(201)
      .json(await createTask(userIdFrom(request), taskCreateSchema.parse(request.body)));
  } catch (error) {
    next(error);
  }
});

tasksRouter.patch("/:id", async (request, response, next) => {
  try {
    response.json(
      await updateTask(
        userIdFrom(request),
        request.params.id,
        taskUpdateSchema.parse(request.body),
      ),
    );
  } catch (error) {
    next(error);
  }
});

tasksRouter.delete("/:id", async (request, response, next) => {
  try {
    await deleteTask(userIdFrom(request), request.params.id);
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});
