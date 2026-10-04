import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Layers3,
  Wallet,
  CircleHelp,
} from "lucide-react";
import App from "./App";
import type { PublicHistory } from "../shared/publication";
import type { Subscription } from "../shared/types";
import { isCurrent, money, monthly, nextRenewal } from "../shared/domain";
import { SubscriptionComposition } from "./SubscriptionComposition";
import { SubscriptionList } from "./SubscriptionList";
import { Logo, Modal } from "./components";
import { dateLabel, download, per } from "./format";
import { subscriptionsCsv } from "./model";
import "./public.css";

export default function PublicDashboard() {
  const [data, setData] = useState<PublicHistory | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [selected, setSelected] = useState<Subscription | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/public/workspace", { signal: controller.signal })
      .then(async (r) => {
        if (r.status === 404) {
          setMissing(true);
          return;
        }
        if (!r.ok) throw new Error("The public dashboard could not be loaded.");
        const next: PublicHistory = await r.json();
        setData(next);
        if (!next.subscriptions.some((s) => s.currency === "USD"))
          setCurrency(next.subscriptions[0]?.currency ?? "USD");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  if (missing) return <App />;
  if (!data)
    return (
      <main className="public-loading" aria-live="polite">
        {error ? (
          <>
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => setAttempt(attempt + 1)}
            >
              Try again
            </button>
          </>
        ) : (
          <p>Loading subscription history…</p>
        )}
      </main>
    );
  const subscriptions = data.subscriptions.filter(
    (s) => s.currency === currency,
  );
  const active = subscriptions.filter((s) => isCurrent(s));
  const unconfirmed = subscriptions.filter((s) => s.status === "unconfirmed");
  const ended = subscriptions.filter(
    (s) => s.status !== "unconfirmed" && !isCurrent(s),
  );
  const currencies = [
    ...new Set(data.subscriptions.map((s) => s.currency)),
  ].sort();
  const total = active.reduce((n, s) => n + monthly(s), 0);
  const renewals = active
    .map((s) => ({ sub: s, date: nextRenewal(s) }))
    .filter((x): x is { sub: Subscription; date: string } => Boolean(x.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <main className="main-shell public-main" id="main-content">
        <header className="public-header">
          <a href="/" className="public-wordmark">
            folio<span>.</span>
          </a>
          <div className="public-header-actions">
            <span className="muted">
              Public snapshot · {dateLabel(data.publishedAt, true)}
            </span>
            <a href="/workspace" className="text-button">
              My workspace <ArrowUpRight size={16} />
            </a>
          </div>
        </header>
        <div className="page-heading">
          <h1>Subscription overview</h1>
          <select
            aria-label="Display currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="metrics">
          {[
            {
              label: "Confirmed monthly cost",
              value: money(total, currency),
              icon: <Wallet size={19} />,
              detail: `${unconfirmed.length} unconfirmed excluded`,
            },
            {
              label: "Current subscriptions",
              value: String(active.length),
              icon: <Layers3 size={19} />,
            },
            {
              label: "Needs confirmation",
              value: String(unconfirmed.length),
              icon: <CircleHelp size={19} />,
            },
            {
              label: "Ended subscriptions",
              value: String(ended.length),
              icon: <CalendarDays size={19} />,
            },
          ].map((m) => (
            <section className="metric-card" key={m.label}>
              <div className="metric-top">
                <span>{m.label}</span>
                <span className="metric-icon">{m.icon}</span>
              </div>
              <div className="metric-value">{m.value}</div>
              {m.detail && <div className="metric-detail">{m.detail}</div>}
            </section>
          ))}
        </div>
        <section className="panel public-composition">
          <div className="panel-heading">
            <h2>Subscription breakdown</h2>
          </div>
          <SubscriptionComposition
            subscriptions={active}
            onSelect={setSelected}
          />
        </section>
        <SubscriptionList
          subscriptions={subscriptions}
          onOpen={setSelected}
          readOnly
          onAddData={() => {}}
          onExport={() =>
            download(
              `folio-public-${currency}.csv`,
              subscriptionsCsv(subscriptions),
            )
          }
        />
        <section className="panel public-renewals">
          <div className="panel-heading">
            <h2>Upcoming payments</h2>
          </div>
          {renewals.length ? (
            renewals.map(({ sub, date }) => (
              <button
                className="public-renewal"
                key={sub.id}
                onClick={() => setSelected(sub)}
              >
                <Logo sub={sub} />
                <span>
                  <strong>{sub.name}</strong>
                  <small>{dateLabel(date, true)}</small>
                </span>
                <strong>{money(sub.price, sub.currency)}</strong>
              </button>
            ))
          ) : (
            <p className="small-note">No confirmed renewals.</p>
          )}
        </section>
        <footer className="public-footer">
          {data.subscriptions.length} records ·{" "}
          {data.subscriptions.reduce((n, s) => n + (s.charges?.length ?? 0), 0)}{" "}
          payments · Read-only
        </footer>
      </main>
      {selected && (
        <PublicDetail sub={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
function PublicDetail({
  sub,
  onClose,
}: {
  sub: Subscription;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const charges = [...(sub.charges ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const next = nextRenewal(sub);
  return (
    <Modal title={sub.name} onClose={onClose}>
      <div className="public-detail">
        <div className="public-detail-heading">
          <Logo sub={sub} />
          <span>{sub.plan}</span>
        </div>
        <div className="detail-price">
          <strong>
            {sub.priceKnown === false
              ? "Unknown price"
              : money(sub.price, sub.currency)}
          </strong>
          <span>
            {isCurrent(sub) ? `per ${per(sub.cycle)}` : "last known amount"}
          </span>
        </div>
        {sub.billingNote && <p className="small-note">{sub.billingNote}</p>}
        <div className="detail-facts">
          <div>
            <span>Status</span>
            <strong>
              {sub.status === "unconfirmed"
                ? "Needs confirmation"
                : isCurrent(sub)
                  ? "Current"
                  : "Ended"}
            </strong>
          </div>
          <div>
            <span>Next renewal</span>
            <strong>{next ? dateLabel(next, true) : "None projected"}</strong>
          </div>
        </div>
        {sub.status === "unconfirmed" && (
          <p className="notice">
            Current billing terms need confirmation. Excluded from spending and
            renewal forecasts.
          </p>
        )}
        <section className="charge-history">
          <h3 className="detail-subheading">Payment history</h3>
          {charges.length ? (
            <>
              <ul>
                {charges.slice(0, showAll ? undefined : 12).map((c) => (
                  <li key={c.id}>
                    <span>{dateLabel(c.date, true)}</span>
                    <strong>{money(c.amount, c.currency)}</strong>
                  </li>
                ))}
              </ul>
              {charges.length > 12 && (
                <button
                  className="text-button"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll
                    ? "Show recent payments"
                    : `Show all ${charges.length} payments`}
                </button>
              )}
            </>
          ) : (
            <p className="small-note">
              No verified payment amount found in the reviewed messages.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
