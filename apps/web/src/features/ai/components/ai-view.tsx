"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, MessageSquarePlus, Send, Sparkles, Trash2 } from "lucide-react";
import { useConversation, useConversations, useCreateConversation, useDeleteConversation } from "../api/queries";
import { useAIChat } from "../hooks/use-ai-chat";
import { ChatMessage } from "./chat-message";
import type { ConversationMessage } from "../types";

const starterPrompts = [
  "Help me think through what I should focus on today.",
  "Help me turn a vague goal into a concrete next step.",
  "What makes a useful reflection after a work session?",
];

function formatConversationTitle(title: string | null): string {
  return title?.trim() || "New conversation";
}

export function AIView() {
  const conversations = useConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [conversationError, setConversationError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const shouldFollowTranscriptRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const detail = useConversation(selectedId);
  const chat = useAIChat(selectedId);

  useEffect(() => {
    if (!selectedId && conversations.data?.length) setSelectedId(conversations.data[0].id);
  }, [conversations.data, selectedId]);

  const messages = detail.data?.messages ?? [];
  const isGenerating = Boolean(chat.streamingMessageId);
  const streamingMessage = useMemo<ConversationMessage | null>(() => {
    if (!chat.streamingMessageId) return null;
    return {
      id: `${chat.streamingMessageId}:streaming`,
      role: "assistant",
      content: chat.streamingText || "Thinking…",
      provider: null,
      model: null,
      finishReason: null,
      createdAt: new Date().toISOString(),
    };
  }, [chat.streamingMessageId, chat.streamingText]);

  useEffect(() => {
    shouldFollowTranscriptRef.current = true;
    setShowScrollToBottom(false);
  }, [selectedId]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !shouldFollowTranscriptRef.current) return;
    transcript.scrollTo({
      top: transcript.scrollHeight,
      behavior: chat.streamingMessageId ? "auto" : "smooth",
    });
  }, [chat.streamingMessageId, chat.streamingText, messages.length, selectedId]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
  }, [draft]);

  async function submitMessage(value = draft) {
    const normalized = value.trim();
    if (!normalized || createConversation.isPending) return;

    if (selectedId) {
      if (chat.sendMessage(normalized)) setDraft("");
      return;
    }

    try {
      const conversation = await createConversation.mutateAsync(normalized.slice(0, 120));
      setSelectedId(conversation.id);
      setConversationError(null);
      if (chat.sendMessage(normalized, conversation.id)) setDraft("");
    } catch {
      setConversationError("A conversation could not be created. Check the API and database connection, then try again.");
    }
  }

  function handleNewConversation() {
    createConversation.mutate(undefined, {
      onSuccess: (conversation) => setSelectedId(conversation.id),
    });
  }

  function handleTranscriptScroll() {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    const isNearBottom = distanceFromBottom < 120;
    shouldFollowTranscriptRef.current = isNearBottom;
    setShowScrollToBottom(!isNearBottom);
  }

  function scrollTranscriptToBottom() {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    shouldFollowTranscriptRef.current = true;
    setShowScrollToBottom(false);
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
  }

  async function handleDeleteConversation(id: string, title: string | null) {
    if (deleteConversation.isPending || (selectedId === id && isGenerating)) return;
    const label = formatConversationTitle(title);
    if (!window.confirm(`Delete “${label}”? This permanently removes its message history.`)) return;

    setConversationError(null);
    try {
      await deleteConversation.mutateAsync(id);
      if (selectedId === id) {
        const nextConversation = conversations.data?.find((conversation) => conversation.id !== id);
        setSelectedId(nextConversation?.id ?? null);
      }
    } catch {
      setConversationError("That conversation could not be deleted. Please try again.");
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {sidebarOpen && (
        <aside className="hidden h-full min-h-0 w-72 shrink-0 border-r border-border-subtle bg-bg-inset lg:flex lg:flex-col">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">AI workspace</p>
              <p className="mt-1 text-xs text-text-muted">Your conversations</p>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-md p-2 text-text-tertiary hover:bg-bg-secondary hover:text-text-primary" aria-label="Hide conversation history">
              <ChevronLeft size={16} />
            </button>
          </div>
          <div className="p-3">
            <button type="button" onClick={handleNewConversation} disabled={createConversation.isPending} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-card px-3 text-sm text-text-primary hover:border-accent-default/50 disabled:opacity-50">
              <MessageSquarePlus size={15} /> New conversation
            </button>
          </div>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4 [scrollbar-gutter:stable]" aria-label="Conversation history">
            {conversations.isPending && <p className="px-3 py-2 text-xs text-text-muted">Loading conversations…</p>}
            {conversations.isError && <p className="px-3 py-2 text-xs text-danger">Conversation history could not be loaded.</p>}
            {conversations.data?.map((conversation) => (
              <div key={conversation.id} className={`group flex min-h-10 items-center rounded-lg text-sm ${selectedId === conversation.id ? "bg-bg-tertiary text-text-primary" : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"}`}>
                <button type="button" onClick={() => setSelectedId(conversation.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
                  <Bot size={14} className="shrink-0 text-text-tertiary" />
                  <span className="truncate">{formatConversationTitle(conversation.title)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteConversation(conversation.id, conversation.title)}
                  disabled={deleteConversation.isPending || (selectedId === conversation.id && isGenerating)}
                  className="mr-1 rounded-md p-1.5 text-text-tertiary opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Delete ${formatConversationTitle(conversation.title)}`}
                  title={selectedId === conversation.id && isGenerating ? "Wait for the response to finish" : "Delete conversation"}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </nav>
        </aside>
      )}

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg-default">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {!sidebarOpen && <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-md p-2 text-text-tertiary hover:bg-bg-secondary hover:text-text-primary" aria-label="Show conversation history"><ChevronRight size={16} /></button>}
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent-default/15 text-accent-default"><Sparkles size={16} /></div>
            <div><h1 className="text-sm font-semibold text-text-primary">ProductiveHix AI</h1><p className="text-xs text-text-muted">A grounded thinking partner</p></div>
          </div>
          <span className={`hidden items-center gap-1.5 text-xs sm:flex ${chat.connected ? "text-success" : "text-text-muted"}`}><span className={`h-1.5 w-1.5 rounded-full ${chat.connected ? "bg-success" : "bg-text-tertiary"}`} />{chat.connected ? "Connected" : "Connecting"}</span>
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={transcriptRef} onScroll={handleTranscriptScroll} className="h-full overflow-y-auto overscroll-contain px-4 py-8 sm:px-8 [scrollbar-gutter:stable]">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-6 pb-4">
            {detail.isPending && <div className="py-12 text-center text-sm text-text-muted">Loading conversation…</div>}
            {detail.isError && <div role="alert" className="rounded-xl border border-border-subtle bg-bg-card p-5 text-sm text-text-secondary">This conversation could not be loaded. Select another conversation or start a new one.</div>}
            {!detail.isPending && !detail.isError && messages.length === 0 && !isGenerating && (
              <div className="m-auto w-full max-w-2xl py-10 text-center">
                <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-accent-default/15 text-accent-default"><Sparkles size={22} /></div>
                <h2 className="text-2xl font-semibold tracking-tight text-text-primary">What can I help you think through?</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-text-secondary">Ask for planning help, reflection prompts, or a clearer next step. The assistant will be explicit when it lacks evidence from your ProductiveHix records.</p>
              <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">{starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void submitMessage(prompt)} disabled={!chat.connected || createConversation.isPending} className="rounded-xl border border-border-subtle bg-bg-card p-4 text-sm leading-6 text-text-secondary hover:border-accent-default/50 hover:text-text-primary disabled:opacity-50">{prompt}</button>)}</div>
            </div>
            )}
            {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
            {streamingMessage && <ChatMessage message={streamingMessage} />}
            {(chat.error || conversationError) && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{chat.error || conversationError}</div>}
            </div>
          </div>
          {showScrollToBottom && (
            <button type="button" onClick={scrollTranscriptToBottom} className="absolute bottom-4 left-1/2 grid h-9 -translate-x-1/2 place-items-center rounded-full border border-border-subtle bg-bg-card px-4 text-xs font-medium text-text-secondary shadow-lg hover:bg-bg-secondary hover:text-text-primary" aria-label="Scroll to latest message">
              Jump to latest
            </button>
          )}
        </div>

        <div className="relative z-10 shrink-0 border-t border-border-subtle bg-bg-default/95 px-4 pb-5 pt-4 backdrop-blur-xl sm:px-8">
          <form className="mx-auto max-w-3xl" onSubmit={(event) => { event.preventDefault(); void submitMessage(); }}>
            <div className="flex items-end gap-3 rounded-2xl border border-border-strong bg-bg-card p-2 shadow-lg shadow-black/5 focus-within:border-accent-default/60">
              <textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} disabled={isGenerating} rows={1} placeholder="Message ProductiveHix AI…" aria-label="Message ProductiveHix AI" className="max-h-40 min-h-11 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted disabled:opacity-50" />
              <button type="submit" disabled={!draft.trim() || !chat.connected || isGenerating || createConversation.isPending} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-default text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send size={16} /></button>
            </div>
            <p className="mt-2 text-center text-[11px] text-text-muted">AI can be wrong. Check important conclusions against recorded evidence.</p>
          </form>
        </div>
      </section>
    </div>
  );
}
