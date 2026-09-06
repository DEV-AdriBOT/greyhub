"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import type { ChatMessage } from "@/lib/chat";

function messageTime(value: string) {
  return value.slice(11, 16);
}

export function ChatRoom({
  initialMessages,
  currentUserId,
}: {
  initialMessages: ChatMessage[];
  currentUserId: number;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const latestId = useRef(initialMessages.at(-1)?.id || 0);
  const router = useRouter();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`/api/chat?after=${latestId.current}`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.push("/login");
          router.refresh();
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as { messages: ChatMessage[] };
        if (!active || !data.messages.length) return;
        latestId.current = data.messages.at(-1)?.id || latestId.current;
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id));
          return [
            ...current,
            ...data.messages.filter((message) => !known.has(message.id)),
          ].slice(-100);
        });
      } catch {
        // The next poll will retry quietly.
      }
    };

    const interval = window.setInterval(poll, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [router]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = body.trim();
    if (!message || sending) return;

    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });
      const data = (await response.json()) as {
        message?: ChatMessage;
        error?: string;
      };
      if (!response.ok || !data.message) {
        setError(data.error || "Message could not be sent.");
        return;
      }
      latestId.current = Math.max(latestId.current, data.message.id);
      setMessages((current) => [...current, data.message as ChatMessage].slice(-100));
      setBody("");
    } catch {
      setError("Message could not be sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="chat-room">
      <div className="chat-status">
        <span /> Channel online
        <small>Updates every 3 seconds</small>
      </div>
      <div className="chat-messages" ref={listRef} aria-live="polite">
        {!messages.length && (
          <div className="chat-empty">
            <strong>No radio traffic yet.</strong>
            <span>Send the first message to the crew.</span>
          </div>
        )}
        {messages.map((message) => {
          const mine = message.user_id === currentUserId;
          return (
            <article className={`chat-message${mine ? " mine" : ""}`} key={message.id}>
              <Avatar
                username={message.username}
                image={message.profile_image}
                size="small"
              />
              <div>
                <header>
                  <strong>{mine ? "You" : message.username}</strong>
                  <time dateTime={message.created_at}>{messageTime(message.created_at)}</time>
                </header>
                <p>{message.body}</p>
              </div>
            </article>
          );
        })}
      </div>
      <form className="chat-compose" onSubmit={sendMessage}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          rows={2}
          placeholder="Message the crew…"
          aria-label="Chat message"
          required
        />
        <div>
          <span className={error ? "form-error" : "muted"}>
            {error || `${body.length}/500 · Shift + Enter for a new line`}
          </span>
          <button className="button primary" disabled={sending || !body.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
