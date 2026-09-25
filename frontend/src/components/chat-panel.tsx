"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ChatRow } from "@/lib/queries";

const suggestions = [
  "What's on my plate today?",
  "What's my next meeting?",
  "Find a free hour tomorrow",
];

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  label: string;
};

function stamp() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatPanel({
  threadId,
  history,
  model,
}: {
  threadId: string;
  history: ChatRow[];
  model: string;
}) {
  const [messages, setMessages] = useState<Message[]>(() =>
    history.map((row) => ({
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      label: row.created_label,
    }))
  );
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Switching conversations remounts this component (keyed on threadId in
  // AppShell), so initial state is always the right thread's history.

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        label: stamp(),
      },
    ]);
    setInput("");
    setThinking(true);

    const replyId = crypto.randomUUID();
    let opened = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the new turn — the server reads history from the database.
        body: JSON.stringify({ message: trimmed, threadId, model }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const delta = decoder.decode(value, { stream: true });
        if (!delta) continue;

        if (!opened) {
          opened = true;
          setThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              id: replyId,
              role: "assistant",
              content: delta,
              label: stamp(),
            },
          ]);
          continue;
        }

        setMessages((prev) =>
          prev.map((message) =>
            message.id === replyId
              ? { ...message, content: message.content + delta }
              : message
          )
        );
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I couldn't reach the model. ${detail}`,
          label: stamp(),
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.length === 0 && !thinking && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Ask Pixi anything to get started.
            </p>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {thinking && <ThinkingIndicator />}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="mx-auto max-w-2xl">
          {messages.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => send(suggestion)}
                  className="border-border text-muted-foreground hover:border-primary/40 hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="bg-card border-border focus-within:border-primary/50 rounded-xl border transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask Pixi anything..."
              className="placeholder:text-muted-foreground max-h-40 min-h-[3rem] w-full resize-none bg-transparent px-4 py-3.5 text-sm outline-none"
            />
            <div className="flex items-center justify-end px-2.5 pb-2.5">
              <Button
                size="icon-sm"
                onClick={() => send(input)}
                disabled={!input.trim() || thinking}
                aria-label="Send message"
              >
                <ArrowUp />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-secondary max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="bg-primary/15 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        <span className="text-muted-foreground mt-1.5 block text-[0.7rem]">
          {message.label}
        </span>
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="bg-primary/15 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
        <Sparkles className="size-3.5" />
      </div>
      <div className="flex items-center gap-1 pt-2">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
