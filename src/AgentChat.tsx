import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { post } from "./api";
import { useDrawerFocus } from "./components";
const Message = () => (
  <MessagePrimitive.Root className="chat-message">
    <MessagePrimitive.Parts />
  </MessagePrimitive.Root>
);
export default function AgentChat({ onClose }: { onClose: () => void }) {
  const focusRef = useDrawerFocus();
  const runtime = useLocalRuntime({
    async run({ messages, abortSignal }) {
      const message =
        messages
          .filter((m) => m.role === "user")
          .at(-1)
          ?.content.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n") || "";
      try {
        const result = await post<{ text: string }>(
          "/api/chat",
          { message },
          { signal: abortSignal },
        );
        if (abortSignal.aborted) return { content: [] };
        return { content: [{ type: "text" as const, text: result.text }] };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                e instanceof Error
                  ? e.message
                  : "Could not reach the agent. Please try again.",
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
            <h2>Meet your money’s ally.</h2>
            <p>Folio assistant · Powered by Neon & Mastra</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close assistant"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <AssistantRuntimeProvider runtime={runtime}>
          <ThreadPrimitive.Root className="chat-thread">
            <ThreadPrimitive.Viewport className="chat-viewport">
              <div className="chat-welcome">
                <Sparkles size={30} />
                <h3>A clearer picture, together.</h3>
                <p>
                  Ask about your subscriptions, usage, or where you could save.
                  I’ll show my reasoning.
                </p>
                <div className="chat-suggestions">
                  <ThreadPrimitive.Suggestion
                    prompt="Where could I save the most each month?"
                    autoSend
                  >
                    Find my biggest savings
                  </ThreadPrimitive.Suggestion>
                  <ThreadPrimitive.Suggestion
                    prompt="Which subscriptions need more usage evidence before deciding?"
                    autoSend
                  >
                    Help me understand my usage
                  </ThreadPrimitive.Suggestion>
                  <ThreadPrimitive.Suggestion
                    prompt="Explain my monthly costs versus upcoming annual payments."
                    autoSend
                  >
                    Explain my monthly spending
                  </ThreadPrimitive.Suggestion>
                </div>
              </div>
              <ThreadPrimitive.Messages
                components={{ UserMessage: Message, AssistantMessage: Message }}
              />
            </ThreadPrimitive.Viewport>
            <ComposerPrimitive.Root className="chat-composer">
              <ComposerPrimitive.Input
                placeholder="Ask Folio anything about your subscriptions…"
                aria-label="Message Folio"
              />
              <ComposerPrimitive.Send
                className="send-button"
                aria-label="Send message"
              >
                <ArrowUp size={19} />
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
            <p className="chat-footnote">
              Changes always need your explicit approval.
            </p>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </aside>
    </div>
  );
}
