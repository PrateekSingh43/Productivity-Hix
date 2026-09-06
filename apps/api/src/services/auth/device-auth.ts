import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../../lib/prisma";
import { env } from "../../config/env";
import type { DeviceCodeRequestInput, DeviceVerifyInput, DeviceTokenRequestInput } from "@repo/validation";

const prisma = getDb();

export function generateUserCode(): string {
  const chars = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let code = "PHIX-";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDeviceAuthorization(input: DeviceCodeRequestInput) {
  const deviceCode = randomBytes(32).toString("hex");
  const userCode = generateUserCode();
  const expiresIn = 900; // 15 minutes
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await prisma.deviceAuthorization.create({
    data: {
      deviceCode,
      userCode,
      status: "pending",
      clientName: input.clientName,
      expiresAt,
    },
  });

  const webOrigin = env.WEB_ORIGIN || "http://localhost:3000";
  const verificationUri = `${webOrigin}/pair`;
  const verificationUriComplete = `${webOrigin}/pair?code=${userCode}`;

  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete,
    expiresIn,
    interval: 2,
  };
}

export async function verifyDeviceAuthorization(userId: string, input: DeviceVerifyInput) {
  const auth = await prisma.deviceAuthorization.findFirst({
    where: {
      userCode: input.userCode.toUpperCase().trim(),
      status: "pending",
    },
  });

  if (!auth) {
    throw new Error("Invalid or expired user pairing code");
  }

  if (new Date() > auth.expiresAt) {
    await prisma.deviceAuthorization.update({
      where: { id: auth.id },
      data: { status: "expired" },
    });
    throw new Error("Pairing code has expired");
  }

  await prisma.deviceAuthorization.update({
    where: { id: auth.id },
    data: {
      status: "authorized",
      userId,
    },
  });

  return { success: true, userCode: auth.userCode };
}

export async function exchangeDeviceToken(input: DeviceTokenRequestInput) {
  const auth = await prisma.deviceAuthorization.findUnique({
    where: { deviceCode: input.deviceCode },
  });

  if (!auth) {
    return { status: 400, error: "invalid_grant" };
  }

  if (auth.status === "pending") {
    if (new Date() > auth.expiresAt) {
      await prisma.deviceAuthorization.update({
        where: { id: auth.id },
        data: { status: "expired" },
      });
      return { status: 400, error: "expired_token" };
    }
    return { status: 428, error: "authorization_pending" };
  }

  if (auth.status !== "authorized" || !auth.userId) {
    return { status: 400, error: "invalid_or_consumed_code" };
  }

  // Create or retrieve DesktopDevice
  const device = await prisma.desktopDevice.create({
    data: {
      userId: auth.userId,
      name: auth.clientName || "Windows Desktop Bridge",
      platform: "windows",
      hostname: "DESKTOP",
    },
  });

  const rawToken = `phix_dt_${randomBytes(24).toString("hex")}`;
  const tokenHash = hashToken(rawToken);

  await prisma.deviceToken.create({
    data: {
      userId: auth.userId,
      deviceId: device.id,
      tokenHash,
      source: "desktop",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  // Mark authorization consumed
  await prisma.deviceAuthorization.update({
    where: { id: auth.id },
    data: { status: "consumed", deviceId: device.id },
  });

  return {
    status: 200,
    credentials: {
      deviceId: device.id,
      deviceToken: rawToken,
      userId: auth.userId,
      hostname: device.hostname,
      pairedAt: new Date().toISOString(),
    },
  };
}

export async function validateDeviceToken(token: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.deviceToken.findUnique({
    where: { tokenHash },
    include: { device: true },
  });

  if (!record) return null;
  if (record.expiresAt && new Date() > record.expiresAt) return null;

  // Update lastUsedAt asynchronously
  prisma.deviceToken
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    userId: record.userId,
    deviceId: record.deviceId,
    source: record.source,
  };
}

export async function createExtensionDevToken(input: {
  installationId: string;
  clientName?: string;
  browser?: string;
}) {
  const defaultUserId = "00000000-0000-0000-0000-000000000001";
  
  // Ensure default dev user exists
  await prisma.user.upsert({
    where: { id: defaultUserId },
    update: {},
    create: { id: defaultUserId, displayName: "Local Developer" },
  });

  // Register or update browser installation in PostgreSQL
  let installation = await prisma.browserInstallation.findFirst({
    where: { userId: defaultUserId },
  });

  if (!installation) {
    installation = await prisma.browserInstallation.create({
      data: {
        userId: defaultUserId,
        browser: input.browser || "chromium",
        extensionVersion: "0.2.0",
        lastActiveAt: new Date(),
      },
    });
  } else {
    await prisma.browserInstallation.update({
      where: { id: installation.id },
      data: { lastActiveAt: new Date(), browser: input.browser || "chromium" },
    });
  }

  // Generate a real device token
  const rawToken = `phix_dt_${randomBytes(24).toString("hex")}`;
  const tokenHash = hashToken(rawToken);

  await prisma.deviceToken.create({
    data: {
      userId: defaultUserId,
      tokenHash,
      source: "browser",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  return {
    deviceToken: rawToken,
    userId: defaultUserId,
    installationId: input.installationId,
    installationDbId: installation.id,
  };
}

