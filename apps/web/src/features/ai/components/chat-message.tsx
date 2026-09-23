"use client";

import { Bot, UserRound } from "lucide-react";
import type { ConversationMessage } from "../types";

function MessageContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-7 text-text-primary">
      {content.split(/\n{2,}/).map((block, index) => {
        const lines = block.split("\n");
        const first = lines[0] ?? "";
        if (first.startsWith("#")) {
          return (
            <div key={index} className="space-y-1">
              <h3 className="text-base font-semibold text-text-primary">{first.replace(/^#+\s*/, "")}</h3>
              {lines.slice(1).length > 0 && <p className="whitespace-pre-wrap">{lines.slice(1).join("\n")}</p>}
            </div>
          );
        }
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line) => <li key={line}>{line.replace(/^\s*[-*]\s+/, "")}</li>)}
            </ul>
          );
        }
        return <p key={index} className="whitespace-pre-wrap">{block}</p>;
      })}
    </div>
  );
}

export function ChatMessage({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-default/15 text-accent-default">
          <Bot size={15} aria-hidden="true" />
        </div>
      )}
      <div className={`max-w-3xl rounded-2xl px-4 py-3 ${isUser ? "bg-accent-default text-white" : "border border-border-subtle bg-bg-card"}`}>
        {isUser ? <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p> : <MessageContent content={message.content} />}
      </div>
      {isUser && (
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-subtle bg-bg-card text-text-secondary">
          <UserRound size={15} aria-hidden="true" />
        </div>
      )}
    </article>
  );
}
