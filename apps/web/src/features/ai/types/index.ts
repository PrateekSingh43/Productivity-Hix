export type AIMessageRole = "user" | "assistant";

export interface ConversationSummary {
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

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}
