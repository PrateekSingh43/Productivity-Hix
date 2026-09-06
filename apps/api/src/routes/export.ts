import { Router } from "express";
import { getDb } from "@repo/db";
import { requireAuth, userIdFrom } from "../middleware/auth";

export const exportRouter: Router = Router();

exportRouter.use(requireAuth);

exportRouter.get("/", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const db = getDb();

    const [user, tasks, workSessions, checkIns, learningAssessments, desktopDevices, browserInstallations] =
      await Promise.all([
        db.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.task.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        db.workSession.findMany({
          where: { userId },
          orderBy: { startedAt: "desc" },
        }),
        db.checkIn.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        db.learningAssessment.findMany({
          where: { userId },
          include: { questions: true },
          orderBy: { scheduledAt: "desc" },
        }),
        db.desktopDevice.findMany({
          where: { userId },
        }),
        db.browserInstallation.findMany({
          where: { userId },
        }),
      ]);

    const exportPayload = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      user,
      counts: {
        tasks: tasks.length,
        workSessions: workSessions.length,
        checkIns: checkIns.length,
        learningAssessments: learningAssessments.length,
        desktopDevices: desktopDevices.length,
        browserInstallations: browserInstallations.length,
      },
      data: {
        tasks,
        workSessions,
        checkIns,
        learningAssessments,
        devices: {
          desktop: desktopDevices,
          browser: browserInstallations,
        },
      },
    };

    response.setHeader("Content-Type", "application/json");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="productivehix-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    response.json(exportPayload);
  } catch (error) {
    next(error);
  }
});
