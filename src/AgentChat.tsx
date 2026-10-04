import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowUp, ArrowUpRight, Sparkles, X } from "lucide-react";
import { createContext, useContext } from "react";
import type { Subscription } from "../shared/types";
import { post } from "./api";
import { useDrawerFocus } from "./components";
import { boundHistory, safeLinks, type ChatLink, type ChatTurn } from "./model";

type ChatContext = {
  subscriptions: Subscription[];
  onOpen: (id: string) => void;
};
const Ctx = createContext<ChatContext>({ subscriptions: [], onOpen: () => {} });

function Links() {
  const { subscriptions, onOpen } = useContext(Ctx);
  const raw = useAuiState(
    ({ message }) =>
      (message.metadata?.custom as { links?: unknown } | undefined)?.links,
  );
  const links = safeLinks(raw, subscriptions);
  if (!links.length) return null;
  return (
    <div className="chat-links" aria-label="Related subscriptions">
      {links.map((l) => (
        <button
          key={l.subscriptionId}
          className="chat-link"
          onClick={() => onOpen(l.subscriptionId)}
        >
          {l.label} <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
const UserMessage = () => (
  <MessagePrimitive.Root className="chat-message">
    <MessagePrimitive.Parts />
  </MessagePrimitive.Root>
);
const AssistantMessage = () => (
  <MessagePrimitive.Root className="chat-message">
    <MessagePrimitive.Parts />
    <Links />
  </MessagePrimitive.Root>
);

export default function AgentChat({
  onClose,
  subscriptions,
  onOpenSubscription,
}: {
  onClose: () => void;
  subscriptions: Subscription[];
  onOpenSubscription: (id: string) => void;
}) {
  const focusRef = useDrawerFocus();
  const runtime = useLocalRuntime({
    async run({ messages, abortSignal }) {
      const turns: ChatTurn[] = messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("\n"),
      }));
      try {
        const result = await post<{ text: string; links?: ChatLink[] }>(
          "/api/chat",
          { messages: boundHistory(turns) },
          { signal: abortSignal },
        );
        if (abortSignal.aborted) return { content: [] };
        return {
          content: [{ type: "text" as const, text: result.text }],
          metadata: { custom: { links: result.links ?? [] } },
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                e instanceof Error
                  ? e.message
                  : "Could not reach the assistant. Please try again.",
            },
          ],
        };
      }
    },
  });
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={focusRef}
        tabIndex={-1}
        className="chat-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Folio assistant"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <span className="agent-mark">
            <Sparkles size={21} />
          </span>
          <div>
            <h2>Folio assistant</h2>
            <p className="drawer-sub">Answers only. Changes need your approval.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close assistant"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <Ctx.Provider value={{ subscriptions, onOpen: onOpenSubscription }}>
          <AssistantRuntimeProvider runtime={runtime}>
            <ThreadPrimitive.Root className="chat-thread">
              <ThreadPrimitive.Viewport className="chat-viewport">
                <div className="chat-welcome">
                  <div className="chat-suggestions">
                    <ThreadPrimitive.Suggestion
                      prompt="Which renewals should I decide on first?"
                      autoSend
                    >
                      What should I decide first?
                    </ThreadPrimitive.Suggestion>
                    <ThreadPrimitive.Suggestion
                      prompt="Which subscriptions need more usage evidence before deciding?"
                      autoSend
                    >
                      What needs more evidence?
                    </ThreadPrimitive.Suggestion>
                    <ThreadPrimitive.Suggestion
                      prompt="Explain my monthly costs versus upcoming annual payments."
                      autoSend
                    >
                      Explain my monthly costs
                    </ThreadPrimitive.Suggestion>
                  </div>
                </div>
                <ThreadPrimitive.Messages
                  components={{ UserMessage, AssistantMessage }}
                />
              </ThreadPrimitive.Viewport>
              <ComposerPrimitive.Root className="chat-composer">
                <ComposerPrimitive.Input
                  placeholder="Ask about your subscriptions…"
                  aria-label="Message Folio"
                />
                <ComposerPrimitive.Send
                  className="send-button"
                  aria-label="Send message"
                >
                  <ArrowUp size={19} />
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.Root>
          </AssistantRuntimeProvider>
        </Ctx.Provider>
      </aside>
    </div>
  );
}
