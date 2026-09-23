import { getDb } from "@repo/db";

export type AIMessageRole = "user" | "assistant";

export interface ConversationListItem {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  finishReason: string | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationListItem {
  messages: ConversationMessage[];
}

export class ConversationNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super("Conversation not found");
    this.name = "ConversationNotFoundError";
  }
}

function toListItem(conversation: {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { messages: number };
}): ConversationListItem {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation._count.messages,
  };
}

/**
 * Lists only conversations owned by the authenticated user.
 * Conversation ordering is newest activity first; no synthetic history rows
 * are returned when the database is empty.
 */
export async function listConversations(userId: string): Promise<ConversationListItem[]> {
  const conversations = await getDb().aIConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { _count: { select: { messages: true } } },
  });
  return conversations.map(toListItem);
}

export async function createConversation(
  userId: string,
  title?: string,
): Promise<ConversationListItem> {
  const conversation = await getDb().aIConversation.create({
    data: {
      userId,
      title: title?.trim().slice(0, 120) || null,
    },
    include: { _count: { select: { messages: true } } },
  });
  return toListItem(conversation);
}

/** Permanently deletes one owned conversation and its messages via cascade. */
export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<{ deleted: true }> {
  const result = await getDb().aIConversation.deleteMany({
    where: { id: conversationId, userId },
  });
  if (result.count === 0) throw new ConversationNotFoundError();
  return { deleted: true };
}

/** Loads a conversation and its durable transcript after an ownership check. */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationDetail> {
  const conversation = await getDb().aIConversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) throw new ConversationNotFoundError();

  return {
    ...toListItem(conversation),
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role as AIMessageRole,
      content: message.content,
      provider: message.provider,
      model: message.model,
      finishReason: message.finishReason,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

/**
 * Appends a user message and refreshes the conversation title in one
 * transaction. The first message becomes the display title unless a title
 * already exists; the full content remains the durable source of truth.
 */
export async function appendUserMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
): Promise<void> {
  const db = getDb();
  const normalized = content.trim();
  await db.$transaction(async (tx) => {
    const conversation = await tx.aIConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, title: true },
    });
    if (!conversation) throw new ConversationNotFoundError();

    const existingMessage = await tx.aIMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    if (existingMessage && existingMessage.conversationId !== conversationId) {
      throw new Error("Message id is already used by another conversation");
    }

    await tx.aIMessage.upsert({
      where: { id: messageId },
      create: { id: messageId, conversationId, role: "user", content: normalized },
      update: {},
    });

    await tx.aIConversation.update({
      where: { id: conversationId },
      data: { title: conversation.title ?? normalized.slice(0, 120) },
    });
  });
}

export async function appendAssistantMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
  metadata: { provider?: string; model?: string; finishReason?: string } = {},
): Promise<void> {
  const conversation = await getDb().aIConversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!conversation) throw new ConversationNotFoundError();

  await getDb().aIMessage.upsert({
    where: { id: messageId },
    create: {
      id: messageId,
      conversationId,
      role: "assistant",
      content,
      provider: metadata.provider,
      model: metadata.model,
      finishReason: metadata.finishReason,
    },
    update: {
      content,
      provider: metadata.provider,
      model: metadata.model,
      finishReason: metadata.finishReason,
    },
  });
}

export async function getGenerationMessages(userId: string, conversationId: string) {
  const conversation = await getDb().aIConversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      },
    },
  });
  if (!conversation) throw new ConversationNotFoundError();
  return conversation.messages
    .filter((message): message is { role: "user" | "assistant"; content: string } =>
      message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({ role: message.role, content: message.content }));
}
