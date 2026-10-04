import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Check, Loader2, Circle, TriangleAlert } from "lucide-react";
import type { Subscription, Action } from "../shared/types";
import { serviceLogo } from "./serviceLogos";
import { money, utilization } from "../shared/domain";

let activeOverlays = 0;
let previousOverflow = "";
export function isolateOverlay() {
  const surfaces = Array.from(
    document.querySelectorAll<HTMLElement>(".main-shell, .sidebar, .skip-link"),
  );
  if (activeOverlays++ === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    surfaces.forEach((el) => (el.inert = true));
  }
  return () => {
    if (--activeOverlays === 0) {
      document.body.style.overflow = previousOverflow;
      surfaces.forEach((el) => (el.inert = false));
    }
  };
}

export function Logo({
  sub,
  small = false,
}: {
  sub: Subscription;
  small?: boolean;
}) {
  const source = serviceLogo(sub);
  const [failedSource, setFailedSource] = useState<string>();
  const showLogo = source && failedSource !== source;
  return (
    <span
      className={`service-logo ${small ? "small" : ""} ${showLogo ? "brand-logo" : "fallback-logo"}`}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={source}
          alt=""
          width={32}
          height={32}
          decoding="async"
          onError={() => setFailedSource(source)}
        />
      ) : (
        sub.name.trim().slice(0, 1).toUpperCase() || "?"
      )}
    </span>
  );
}

export function UsageBadge({ sub }: { sub: Subscription }) {
  const u = utilization(sub);
  return (
    <span className={`badge ${u.tone}`} title={u.detail}>
      <span />
      {u.label}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = returnFocus.current;
    const release = isolateOverlay();
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input,textarea,select,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      release();
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function ActionProgress({ action }: { action: Action }) {
  return (
    <>
      <div className="action-steps" role="status" aria-live="polite">
        {action.steps.map((step, i) => (
          <div className={`action-step ${step.status}`} key={step.label}>
            <span>
              {step.status === "done" ? (
                <Check size={16} />
              ) : step.status === "running" ? (
                <Loader2 className="spin" size={16} />
              ) : step.status === "failed" ? (
                <TriangleAlert size={16} />
              ) : (
                <Circle size={13} />
              )}
            </span>
            <div>
              <strong>{step.label}</strong>
              <p>
                {step.status === "done"
                  ? "Verified"
                  : step.status === "running"
                    ? "In progress…"
                    : step.status === "failed"
                      ? "Needs attention"
                      : `Step ${i + 1}`}
              </p>
            </div>
          </div>
        ))}
      </div>
      {action.error && (
        <div className="notice error" role="alert">
          {action.error}
        </div>
      )}
      {action.status === "running" && action.liveViewUrl && (
        <a
          className="button secondary"
          href={action.liveViewUrl}
          target="_blank"
          rel="noreferrer"
        >
          Watch browser session
        </a>
      )}
      {action.confirmation && (
        <div className="verification" role="status">
          <Check size={20} />
          <div>
            <strong>Test change verified</strong>
            <p>{action.confirmation}</p>
            <p>
              {action.verification?.plan} ·{" "}
              {money(action.verification?.price || 0)} /{" "}
              {action.verification?.cycle}
            </p>
            {action.kind === "migrate" && (
              <p>
                {action.verification?.exportedItems} documents exported ·{" "}
                {action.verification?.importedItems} imported · content matched
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function useDrawerFocus() {
  const ref = useRef<HTMLElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement);
  useEffect(() => {
    const prior = returnFocus.current;
    const release = isolateOverlay();
    ref.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input,textarea,select,[tabindex="0"]',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      release();
      prior?.focus();
    };
  }, []);
  return ref;
}
