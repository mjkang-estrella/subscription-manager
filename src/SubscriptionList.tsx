import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  Layers3,
  Search,
  Upload,
} from "lucide-react";
import type { Category, Subscription } from "../shared/types";
import { isCurrent, money, nextRenewal, today } from "../shared/domain";
import { Logo, UsageBadge } from "./components";
import { dateLabel, per } from "./format";
import {
  categoriesPresent,
  sortSubscriptions,
  type SortDir,
  type SortKey,
} from "./model";

export function useMediaQuery(query: string) {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export function renewalCell(s: Subscription, asOf = today()) {
  if (!isCurrent(s, asOf)) return { main: "Cancelled", sub: s.endDate ? `Ended ${dateLabel(s.endDate)}` : "" };
  if (s.status === "cancel_pending" && s.endDate)
    return { main: `Ends ${dateLabel(s.endDate)}`, sub: "Cancellation recorded" };
  const r = nextRenewal(s, asOf);
  return {
    main: r ? dateLabel(r) : "None projected",
    sub: s.scheduledChange
      ? `${s.scheduledChange.plan} from ${dateLabel(s.scheduledChange.effectiveDate)}`
      : s.cycle === "yearly"
        ? "Annual renewal"
        : "Monthly",
  };
}

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  renewal: "asc",
  cost: "desc",
  name: "asc",
};

export function SubscriptionList({
  subscriptions,
  onOpen,
  onAddData,
  onExport,
}: {
  subscriptions: Subscription[];
  onOpen: (s: Subscription) => void;
  onAddData: () => void;
  onExport: () => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<Category | "all">("all"),
    [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
      key: "renewal",
      dir: "asc",
    });
  const phone = useMediaQuery("(max-width: 760px)");
  const cats = categoriesPresent(subscriptions);
  const catKey = cats.join("|");
  useEffect(() => {
    if (category !== "all" && !catKey.split("|").includes(category))
      setCategory("all");
  }, [catKey, category]);
  const q = query.trim().toLowerCase();
  const filtered = sortSubscriptions(
    subscriptions.filter(
      (s) =>
        (category === "all" || s.category === category) &&
        `${s.name} ${s.plan} ${s.category}`.toLowerCase().includes(q),
    ),
    sort.key,
    sort.dir,
  );
  const setKey = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] },
    );
  const ariaSort = (key: SortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  const SortHead = ({ k, label }: { k: SortKey; label: string }) => (
    <th aria-sort={ariaSort(k)}>
      <button className="sort-head" onClick={() => setKey(k)}>
        {label}
        {sort.key === k &&
          (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <section className="panel subscriptions-panel">
      <div className="panel-heading">
        <div className="inline-heading">
          <h2>Your subscriptions</h2>
          <span className="count-pill">{subscriptions.length}</span>
        </div>
        <button className="text-button" onClick={onExport}>
          <Download size={15} />
          Export
        </button>
      </div>
      <div className="table-tools">
        {cats.length > 1 && (
          <div className="table-tabs" role="group" aria-label="Filter by category">
            {(["all", ...cats] as const).map((c) => (
              <button
                key={c}
                className={category === c ? "selected" : ""}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        )}
        <div className="table-controls">
          <label className="search-box">
            <Search size={16} />
            <input
              placeholder="Search…"
              aria-label="Search subscriptions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {phone && (
            <label className="sort-box">
              <span className="sr-only">Sort subscriptions</span>
              <select
                aria-label="Sort subscriptions"
                value={`${sort.key}:${sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":") as [SortKey, SortDir];
                  setSort({ key, dir });
                }}
              >
                <option value="renewal:asc">Next renewal</option>
                <option value="cost:desc">Highest cost</option>
                <option value="cost:asc">Lowest cost</option>
                <option value="name:asc">Name A–Z</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {phone ? (
        <ul className="subscription-cards" aria-label="Subscriptions">
          {filtered.map((s) => {
            const r = renewalCell(s);
            return (
              <li key={s.id}>
                <button
                  className={`subscription-card ${!isCurrent(s) ? "is-ended" : ""}`}
                  onClick={() => onOpen(s)}
                  aria-label={`${s.name}, ${money(s.price)} per ${per(s.cycle)}, ${r.main}`}
                >
                  <Logo sub={s} />
                  <span className="card-name">
                    <strong>{s.name}</strong>
                    <small>{s.plan}</small>
                  </span>
                  <span className="card-cost">
                    <strong>{money(s.price)}</strong>
                    <small>/{per(s.cycle)}</small>
                  </span>
                  <span className="card-meta">
                    <span>{r.main}</span>
                    <UsageBadge sub={s} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <SortHead k="name" label="Subscription" />
                <SortHead k="cost" label="Cost" />
                <SortHead k="renewal" label="Next renewal" />
                <th>Usage</th>
                <th aria-label="View details" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const r = renewalCell(s);
                return (
                  <tr
                    key={s.id}
                    className={!isCurrent(s) ? "is-ended" : ""}
                    onClick={() => onOpen(s)}
                  >
                    <td>
                      <div className="service-cell">
                        <Logo sub={s} />
                        <div>
                          <button
                            className="service-name"
                            aria-label={`View ${s.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(s);
                            }}
                          >
                            {s.name}
                          </button>
                          <small>{s.plan}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong className="price">{money(s.price)}</strong>
                      <small>/{per(s.cycle)}</small>
                    </td>
                    <td>
                      <span>{r.main}</span>
                      <small>{r.sub}</small>
                    </td>
                    <td>
                      <UsageBadge sub={s} />
                    </td>
                    <td>
                      <ChevronRight size={16} className="row-chevron" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!filtered.length && (
        <div className="empty-state">
          <Layers3 size={27} />
          <h3>{q ? "No matching subscriptions" : "A little breathing room."}</h3>
          <p>
            {q
              ? "Try a different name or category."
              : "Import a statement or receipts, or add one yourself."}
          </p>
          {!q && (
            <button className="button secondary" onClick={onAddData}>
              Add data
            </button>
          )}
        </div>
      )}
      <div className="table-footer">
        <span>
          {filtered.length} shown · USD
        </span>
        <button className="text-button" onClick={onAddData}>
          <Upload size={14} />
          Add data
        </button>
      </div>
    </section>
  );
}
