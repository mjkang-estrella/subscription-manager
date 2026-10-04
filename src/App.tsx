import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import {
  LayoutDashboard,
  Layers3,
  CalendarDays,
  Sparkles,
  Activity,
  Settings2,
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDown,
  Download,
  SlidersHorizontal,
  Link2,
  CircleHelp,
  Bell,
  X,
  Check,
  Loader2,
  Leaf,
  CreditCard,
  ExternalLink,
  Upload,
  ShieldCheck,
  ArrowRight,
  Menu,
  Wallet,
  Clock3,
  TrendingDown,
  MoreHorizontal,
  FileText,
  Globe,
  LogOut,
} from "lucide-react";
import type {
  Subscription,
  Workspace,
  Recommendation,
  Action,
  ActionKind,
  Integration,
} from "../shared/types";
import {
  money,
  monthly,
  recommendations,
  billingInMonth,
  today,
} from "../shared/domain";
import { api, post } from "./api";
import {
  Modal,
  Logo,
  UsageBadge,
  ActionProgress,
  useDrawerFocus,
} from "./components";
import { SubscriptionComposition } from "./SubscriptionComposition";
const AgentChat = lazy(() => import("./AgentChat"));
const NAV = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "subscriptions", name: "Subscriptions", icon: Layers3 },
  { id: "calendar", name: "Payment calendar", icon: CalendarDays },
  { id: "savings", name: "Savings", icon: Sparkles },
  { id: "activity", name: "Agent activity", icon: Activity },
];
const categories = [
  "All subscriptions",
  "Productivity",
  "Entertainment",
  "Design",
  "Developer tools",
  "Lifestyle",
  "Storage",
];
const actionNames: Record<ActionKind, string> = {
  cancel: "Cancel subscription",
  downgrade: "Downgrade plan",
  yearly: "Switch to annual",
  migrate: "Migrate to an alternative",
};
const monthName = (date: Date, short = false) =>
  date.toLocaleDateString("en-US", {
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
  });
const dateLabel = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
function download(name: string, text: string, type = "text/csv") {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
}
export default function App() {
  const [data, setData] = useState<Workspace | null>(null),
    [loadError, setLoadError] = useState(""),
    [page, setPage] = useState("overview"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All subscriptions"),
    [sort, setSort] = useState("renewal"),
    [sidebar, setSidebar] = useState(false);
  const [modal, setModal] = useState<
      "add" | "import" | "connect" | "personal" | "help" | null
    >(null),
    [selected, setSelected] = useState<Subscription | null>(null),
    [editing, setEditing] = useState<Subscription | null>(null),
    [chat, setChat] = useState(false),
    [toast, setToast] = useState(""),
    [integrations, setIntegrations] = useState<Integration[]>([]),
    [action, setAction] = useState<Action | null>(null),
    [busy, setBusy] = useState(false),
    [monthOffset, setMonthOffset] = useState(0);
  const notify = useCallback((s: string) => setToast(s), []);
  const refresh = useCallback(async () => {
    try {
      setData(await api<Workspace>("/api/workspace"));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    api<Integration[]>("/api/integrations")
      .then(setIntegrations)
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (action?.status !== "running") return;
    const t = setInterval(() => {
      api<Action>(`/api/actions/${action.id}`)
        .then((a) => {
          setAction(a);
          if (a.status !== "running") void refresh();
        })
        .catch((e) => notify(e.message));
    }, 2000);
    return () => clearInterval(t);
  }, [action?.id, action?.status, refresh, notify]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setChat(false);
        setSidebar(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!sidebar) return;
    const menu = document.getElementById("primary-navigation");
    const surface = document.querySelector<HTMLElement>(".main-shell");
    const before = document.activeElement as HTMLElement;
    if (surface) surface.inert = true;
    const first = menu?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = menu?.querySelectorAll<HTMLElement>("a,button");
      if (!items?.length) return;
      const a = items[0],
        z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => {
      if (surface) surface.inert = false;
      window.removeEventListener("keydown", onTab);
      before?.focus();
    };
  }, [sidebar]);
  const current = new Date();
  current.setDate(1);
  current.setMonth(current.getMonth() + monthOffset);
  const month = current.toISOString().slice(0, 7);
  const active = data?.subscriptions.filter((s) => s.status === "active") || [];
  const allRecs = useMemo(
    () => recommendations(data?.subscriptions || []),
    [data],
  );
  const recs = allRecs.filter(
    (r) => !data?.dismissedOpportunityIds?.includes(r.id),
  );
  const [dismissing, setDismissing] = useState<string | null>(null);
  const setOpportunityDismissed = async (id: string, dismissed: boolean) => {
    setDismissing(id);
    try {
      const updated = await post<Workspace>(
        `/api/opportunities/${encodeURIComponent(id)}/dismiss`,
        { dismissed },
      );
      setData(updated);
      notify(
        dismissed
          ? "Opportunity dismissed. You can restore it from subscription details."
          : "Opportunity restored.",
      );
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setDismissing(null);
    }
  };
  const savings = recs.reduce((a, r) => a + r.savings, 0),
    monthlyTotal = active.reduce((a, s) => a + monthly(s), 0);
  const scheduled = active
    .map((s) => ({ sub: s, date: billingInMonth(s, month) }))
    .filter((x): x is { sub: Subscription; date: string } => Boolean(x.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalScheduled = scheduled.reduce((a, x) => a + x.sub.price, 0);
  const filtered = (data?.subscriptions || [])
    .filter(
      (s) =>
        (category === "All subscriptions" || s.category === category) &&
        `${s.name} ${s.plan} ${s.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "price"
        ? monthly(b) - monthly(a)
        : sort === "name"
          ? a.name.localeCompare(b.name)
          : a.nextBilling.localeCompare(b.nextBilling),
    );
  const prepare = async (s: Subscription, kind: ActionKind) => {
    setBusy(true);
    try {
      const a = await post<Action>("/api/actions/prepare", {
        subscriptionId: s.id,
        kind,
      });
      setAction(a);
      setSelected(null);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const navigate = (p: string) => {
    setPage(p);
    setSidebar(false);
    setQuery("");
    setCategory("All subscriptions");
  };
  const exportCsv = () => {
    const esc = (s: unknown) => `"${String(s).replaceAll('"', '""')}"`;
    download(
      "folio-subscriptions.csv",
      [
        "merchant,plan,amount,cycle,date,category,status",
        ...(data?.subscriptions || []).map((s) =>
          [
            s.name,
            s.plan,
            s.price,
            s.cycle,
            s.nextBilling,
            s.category,
            s.status,
          ]
            .map(esc)
            .join(","),
        ),
      ].join("\n"),
    );
    notify("Your subscriptions have been exported.");
  };
  const selectedCurrent = selected
    ? data?.subscriptions.find((s) => s.id === selected.id) || selected
    : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to subscriptions
      </a>
      {sidebar && (
        <button
          className="mobile-nav-dismiss"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        id="primary-navigation"
        className={`sidebar ${sidebar ? "open" : ""}`}
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          folio<span className="brand-period">.</span>
        </a>
        <button
          className="workspace-selector"
          onClick={() => {
            setSidebar(false);
            setModal("personal");
          }}
        >
          <span className="workspace-avatar">M</span>
          <span>Personal workspace</span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="Primary navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
              className={page === item.id ? "active" : ""}
            >
              <item.icon size={19} />
              {item.name}
              {item.id === "savings" && recs.length > 0 && (
                <span className="nav-count">{recs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-link"
            onClick={() => {
              setSidebar(false);
              setModal("connect");
            }}
          >
            <Settings2 size={18} />
            Connections <span className="connected-dot" />
          </button>
          <button
            className="sidebar-link"
            onClick={() => {
              setSidebar(false);
              setModal("help");
            }}
          >
            <CircleHelp size={18} />
            Help & getting started
          </button>
          <div className="profile">
            <span className="profile-avatar">M</span>
            <div>My workspace</div>
            <button
              className="icon-button"
              aria-label="Workspace options"
              onClick={() => {
                setSidebar(false);
                setModal("personal");
              }}
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebar(!sidebar)}
              aria-label="Toggle navigation"
              aria-expanded={sidebar}
              aria-controls="primary-navigation"
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((n) => n.id === page)?.name}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />
              {data?.mode === "demo" ? "Demo workspace" : "Personal workspace"}
            </span>
            <button
              className="icon-button"
              aria-label="View agent activity"
              onClick={() => navigate("activity")}
            >
              <Bell size={19} />
              {data?.actions.some((a) => a.status === "awaiting_approval") && (
                <i />
              )}
            </button>
            <span className="top-avatar">M</span>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1>{NAV.find((item) => item.id === page)?.name}</h1>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setSidebar(false);
                  setModal("connect");
                }}
              >
                <Link2 size={16} />
                Connect account
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setEditing(null);
                  setModal("add");
                }}
              >
                <Plus size={17} />
                Add subscription
              </button>
            </div>
          </div>
          {loadError && (
            <div className="notice error" role="alert">
              {loadError}
              <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}
          {!data && !loadError ? (
            <div className="loading-page">
              <Loader2 className="spin" />
              <p>Gathering your subscriptions…</p>
            </div>
          ) : (
            data && (
              <>
                {(page === "overview" || page === "subscriptions") && (
                  <div className="metrics">
                    <Metric
                      label="Average monthly cost"
                      value={money(monthlyTotal)}
                      icon={<Wallet size={19} />}
                      detail={
                        <>
                          <span className="metric-neutral">
                            {money(monthlyTotal * 12)}
                          </span>{" "}
                          annual equivalent
                        </>
                      }
                    />
                    <Metric
                      label="Scheduled this month"
                      value={money(totalScheduled)}
                      icon={<CalendarDays size={19} />}
                      detail={
                        <>
                          {scheduled.length} upcoming charges in{" "}
                          {monthName(current, true)}
                        </>
                      }
                    />
                    <Metric
                      label="Active subscriptions"
                      value={String(active.length)}
                      icon={<Layers3 size={19} />}
                    />
                    <Metric
                      green
                      label="Potential monthly savings"
                      value={money(savings)}
                      icon={<Sparkles size={19} />}
                      detail={
                        <button
                          className="metric-link"
                          onClick={() => navigate("savings")}
                        >
                          {recs.length} opportunities to explore{" "}
                          <ArrowUpRight size={14} />
                        </button>
                      }
                    />
                  </div>
                )}
                {page === "overview" && (
                  <div className="overview-grid">
                    <section className="panel spending-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Subscription breakdown</h2>
                        </div>
                      </div>
                      <SubscriptionComposition
                        subscriptions={active}
                        onSelect={setSelected}
                      />
                      <div className="chart-footer composition-footer">
                        <span>Annual plans divided by 12</span>
                      </div>
                    </section>
                    <section className="savings-spotlight">
                      <h2>Potential annual savings</h2>
                      <div className="spotlight-amount">
                        {money(savings * 12)}
                        <span>/ year</span>
                      </div>
                      <div className="spotlight-note">
                        {data.mode === "demo"
                          ? "Demo estimates"
                          : "Estimates based on usage"}
                      </div>
                      <button onClick={() => navigate("savings")}>
                        Review {recs.length} opportunities{" "}
                        <ArrowUpRight size={17} />
                      </button>
                    </section>
                  </div>
                )}
                {(page === "overview" || page === "subscriptions") && (
                  <div className={page === "overview" ? "lower-grid" : ""}>
                    <section className="panel subscriptions-panel">
                      <div className="panel-heading">
                        <div className="inline-heading">
                          <h2>Your subscriptions</h2>
                          <span className="count-pill">
                            {data.subscriptions.length}
                          </span>
                        </div>
                        <button className="text-button" onClick={exportCsv}>
                          <Download size={15} />
                          Export
                        </button>
                      </div>
                      <div className="table-tools">
                        <div className="table-tabs">
                          <button
                            className={
                              category === "All subscriptions" ? "selected" : ""
                            }
                            aria-pressed={category === "All subscriptions"}
                            onClick={() => setCategory("All subscriptions")}
                          >
                            All subscriptions
                          </button>
                          <button
                            className={
                              category === "Entertainment" ? "selected" : ""
                            }
                            aria-pressed={category === "Entertainment"}
                            onClick={() => setCategory("Entertainment")}
                          >
                            Entertainment
                          </button>
                          <button
                            className={
                              category === "Productivity" ? "selected" : ""
                            }
                            aria-pressed={category === "Productivity"}
                            onClick={() => setCategory("Productivity")}
                          >
                            Productivity
                          </button>
                        </div>
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
                          <label
                            className="sort-box"
                            title="Sort subscriptions"
                          >
                            <SlidersHorizontal size={16} />
                            <select
                              aria-label="Sort subscriptions"
                              value={sort}
                              onChange={(e) => setSort(e.target.value)}
                            >
                              <option value="renewal">Renewal</option>
                              <option value="price">Cost</option>
                              <option value="name">Name</option>
                            </select>
                          </label>
                        </div>
                      </div>
                      <div
                        className="table-scroll"
                        role="region"
                        aria-label="Subscriptions table; scroll horizontally on small screens"
                        tabIndex={0}
                      >
                        <table>
                          <thead>
                            <tr>
                              <th>Subscription</th>
                              <th>
                                Cost <ArrowDown size={12} />
                              </th>
                              <th>Next payment</th>
                              <th>Utilization</th>
                              <th aria-label="View details" />
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((s) => (
                              <tr key={s.id} onClick={() => setSelected(s)}>
                                <td>
                                  <div className="service-cell">
                                    <Logo sub={s} />
                                    <div>
                                      <button
                                        className="service-name"
                                        aria-label={`View ${s.name}`}
                                        onClick={() => setSelected(s)}
                                      >
                                        {s.name}
                                      </button>
                                      <small>{s.plan}</small>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <strong className="price">
                                    {money(s.price)}
                                  </strong>
                                  <small>
                                    /{s.cycle === "yearly" ? "year" : "month"}
                                  </small>
                                </td>
                                <td>
                                  <span>{dateLabel(s.nextBilling)}</span>
                                  <small>
                                    {s.cycle === "yearly"
                                      ? "Annual renewal"
                                      : s.category}
                                  </small>
                                </td>
                                <td>
                                  <UsageBadge sub={s} />
                                </td>
                                <td>
                                  <ChevronRight
                                    size={16}
                                    className="row-chevron"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!filtered.length && (
                          <div className="empty-state">
                            <Layers3 size={27} />
                            <h3>
                              {query
                                ? "No matching subscriptions"
                                : "A little breathing room."}
                            </h3>
                            <p>
                              {query
                                ? "Try a different name or category."
                                : "Add a subscription or import your receipts to get started."}
                            </p>
                            <button
                              className="button secondary"
                              onClick={() => setModal("import")}
                            >
                              Import subscriptions
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="table-footer">
                        <span>
                          {filtered.length} subscriptions · All amounts in USD
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setModal("import")}
                        >
                          <Upload size={14} />
                          Import from file
                        </button>
                      </div>
                    </section>
                    {page === "overview" && (
                      <aside className="right-column">
                        <section className="panel upcoming-panel">
                          <div className="panel-heading">
                            <h2>Coming up next</h2>
                            <span className="light-icon">
                              <Clock3 size={17} />
                            </span>
                          </div>
                          <div className="upcoming-list">
                            {scheduled.slice(0, 4).map(({ sub: s, date }) => (
                              <button key={s.id} onClick={() => setSelected(s)}>
                                <Logo sub={s} small />
                                <div>
                                  <strong>{s.name}</strong>
                                  <small>
                                    {dateLabel(date)} ·{" "}
                                    {Math.max(
                                      0,
                                      Math.round(
                                        (Date.parse(date) -
                                          Date.parse(today())) /
                                          86400000,
                                      ),
                                    )}{" "}
                                    days away
                                  </small>
                                </div>
                                <strong>{money(s.price)}</strong>
                              </button>
                            ))}
                            {!scheduled.length && (
                              <p className="muted">
                                No payments scheduled this month.
                              </p>
                            )}
                          </div>
                          <button
                            className="calendar-link"
                            onClick={() => navigate("calendar")}
                          >
                            View payment calendar <ChevronRight size={15} />
                          </button>
                        </section>
                      </aside>
                    )}
                  </div>
                )}
                {page === "calendar" && (
                  <section className="panel calendar-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{monthName(current)}</h2>
                        <p>
                          {money(totalScheduled)} scheduled across{" "}
                          {scheduled.length} payments
                        </p>
                      </div>
                      <div className="calendar-navigation">
                        <button
                          className="icon-button"
                          aria-label="Previous month"
                          onClick={() => setMonthOffset((o) => o - 1)}
                        >
                          <ChevronLeft size={19} />
                        </button>
                        <button
                          className="button secondary compact"
                          onClick={() => setMonthOffset(0)}
                        >
                          This month
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Next month"
                          onClick={() => setMonthOffset((o) => o + 1)}
                        >
                          <ChevronRight size={19} />
                        </button>
                      </div>
                    </div>
                    <div className="calendar-week">
                      {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                        (d) => (
                          <span key={d}>{d}</span>
                        ),
                      )}
                    </div>
                    <div className="calendar-grid">
                      {Array.from({ length: current.getDay() }, (_, i) => (
                        <div
                          className="calendar-day outside"
                          key={`empty-${i}`}
                        />
                      ))}
                      {Array.from(
                        {
                          length: new Date(
                            current.getFullYear(),
                            current.getMonth() + 1,
                            0,
                          ).getDate(),
                        },
                        (_, i) => {
                          const day = `${month}-${String(i + 1).padStart(2, "0")}`;
                          return (
                            <div
                              className={`calendar-day ${day === today() ? "today" : ""}`}
                              key={day}
                            >
                              <span className="day-number">{i + 1}</span>
                              {scheduled
                                .filter((x) => x.date === day)
                                .map(({ sub: s }) => (
                                  <button
                                    key={s.id}
                                    onClick={() => setSelected(s)}
                                    style={
                                      {
                                        "--payment-color": s.color,
                                      } as React.CSSProperties
                                    }
                                  >
                                    <span>{s.name}</span>
                                    <strong>{money(s.price)}</strong>
                                  </button>
                                ))}
                            </div>
                          );
                        },
                      )}
                    </div>
                    <p className="calendar-disclaimer">
                      Scheduled amounts are estimates based on your saved plans.
                      They are not confirmed bank transactions.
                    </p>
                  </section>
                )}
                {page === "savings" && (
                  <>
                    <div className="savings-summary">
                      <span className="savings-icon">
                        <Sparkles size={28} />
                      </span>
                      <div>
                        <h2>
                          {money(savings)}{" "}
                          <small>potential monthly savings</small>
                        </h2>
                      </div>
                    </div>
                    <div className="recommendations-grid">
                      {recs.map((r) => {
                        const s = data.subscriptions.find(
                          (s) => s.id === r.subscriptionId,
                        )!;
                        return (
                          <section
                            className="panel recommendation-card"
                            key={r.id}
                          >
                            <div className="rec-card-top">
                              <Logo sub={s} />
                              <span className="badge amber">
                                {r.confidence} confidence
                              </span>
                            </div>
                            <h2>{r.title}</h2>
                            <p>{r.detail}</p>
                            <div className="rec-saving">
                              {r.savings
                                ? `${money(r.savings)} / month`
                                : "Explore a better fit"}
                              <span>
                                {r.savings
                                  ? "potential savings"
                                  : "Price verification needed"}
                              </span>
                            </div>
                            <div className="rec-evidence">
                              <FileText size={16} />
                              <span>
                                {s.evidence.at(-1)?.source} ·{" "}
                                {s.source === "Demo"
                                  ? "Demo evidence"
                                  : dateLabel(
                                      s.evidence.at(-1)?.observedAt || today(),
                                    )}
                              </span>
                            </div>
                            <p className="rec-caveat">{r.caveat}</p>
                            <button
                              className="button primary full"
                              onClick={() => setSelected(s)}
                            >
                              Review opportunity <ArrowUpRight size={16} />
                            </button>
                            <button
                              className="text-button dismiss-opportunity"
                              disabled={dismissing !== null}
                              onClick={() =>
                                void setOpportunityDismissed(r.id, true)
                              }
                            >
                              {dismissing === r.id
                                ? "Dismissing…"
                                : "Dismiss opportunity"}
                            </button>
                          </section>
                        );
                      })}
                      {!recs.length && (
                        <div className="empty-state">
                          <Sparkles size={30} />
                          <h3>
                            {allRecs.length
                              ? "You’re all caught up."
                              : "Let’s get to know your usage."}
                          </h3>
                          <p>
                            {allRecs.length
                              ? "Dismissed opportunities can be restored from subscription details."
                              : "Add usage evidence to find meaningful savings. Missing data never means unused."}
                          </p>
                          <button
                            className="button primary"
                            onClick={() => navigate("subscriptions")}
                          >
                            Review subscriptions
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="notice">
                      <ShieldCheck size={19} />
                      <span>
                        Potential savings are estimates, not money already
                        saved. Prices and consequences are reviewed before any
                        action.
                      </span>
                    </div>
                  </>
                )}
                {page === "activity" && (
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Action history</h2>
                      </div>
                      <span className="muted-tag">
                        Controlled test accounts
                      </span>
                    </div>
                    {data.actions.length ? (
                      data.actions.map((a) => (
                        <button
                          className="activity-row"
                          key={a.id}
                          onClick={() => setAction(a)}
                        >
                          <span
                            className={`activity-icon ${a.status === "completed" ? "success" : ""}`}
                          >
                            {a.status === "completed" ? (
                              <Check size={21} />
                            ) : a.status === "running" ? (
                              <Loader2 className="spin" size={21} />
                            ) : (
                              <Activity size={21} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {actionNames[a.kind]} · {a.subscriptionName}
                            </strong>
                            <small>
                              {new Date(a.createdAt).toLocaleString()} · Sandbox
                            </small>
                          </div>
                          <span
                            className={`badge ${a.status === "completed" ? "green" : a.status === "failed" ? "amber" : "gray"}`}
                          >
                            {a.status.replaceAll("_", " ")}
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      ))
                    ) : (
                      <div className="empty-state">
                        <Activity size={32} />
                        <h3>Nothing happens without you.</h3>
                        <p>
                          When you review a change, its proposal and result will
                          appear here.
                        </p>
                        <button
                          className="button primary"
                          onClick={() => navigate("savings")}
                        >
                          Explore savings
                        </button>
                      </div>
                    )}
                  </section>
                )}
                <footer className="page-footer">
                  <span>
                    {data.mode === "demo"
                      ? "Sample subscriptions & usage · No real accounts changed"
                      : "Private workspace · USD"}{" "}
                  </span>
                </footer>
              </>
            )
          )}
        </main>
        <button
          className="assistant-fab"
          onClick={() => {
            setSidebar(false);
            setChat(true);
          }}
        >
          <Sparkles size={18} />
          <span>Ask Folio</span>
          <span className="shortcut">
            <ArrowUpRight size={16} aria-hidden="true" />
          </span>
        </button>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "add" && (
        <SubscriptionForm
          initial={editing}
          onClose={() => {
            setModal(null);
            setEditing(null);
          }}
          onSave={async () => {
            await refresh();
            setModal(null);
            setEditing(null);
            notify(editing ? "Subscription updated." : "Subscription added.");
          }}
        />
      )}
      {modal === "import" && (
        <ImportModal
          onClose={() => setModal(null)}
          onSave={async (message) => {
            await refresh();
            setModal(null);
            notify(message);
          }}
        />
      )}
      {modal === "connect" && (
        <Connections
          integrations={integrations}
          onClose={() => setModal(null)}
          onImport={() => setModal("import")}
          onNotify={notify}
        />
      )}
      {modal === "personal" && (
        <Modal title="Your personal workspace" onClose={() => setModal(null)}>
          <div className="modal-body">
            <span className="large-icon">
              <Layers3 size={30} />
            </span>
            <h3>
              {data?.mode === "demo"
                ? "Make it yours."
                : "You’re in your personal workspace."}
            </h3>
            <p>
              Demo subscriptions help you explore Folio. Start fresh to remove
              sample subscriptions and import your own. Anything you added
              yourself will stay.
            </p>
            <div className="notice">
              Your browser holds a private workspace session. Use this same
              browser to return to your saved subscriptions.
            </div>
            <button
              className="button primary full"
              disabled={busy || data?.mode === "personal"}
              onClick={async () => {
                setBusy(true);
                try {
                  await post("/api/workspace/personal");
                  await refresh();
                  setModal(null);
                  notify("Your personal workspace is ready.");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Start with my subscriptions
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="A little help getting started"
          onClose={() => setModal(null)}
        >
          <div className="modal-body help-body">
            <h3>1. Bring everything together</h3>
            <p>
              Add a subscription manually, import a card CSV, or connect Gmail.
              Review imported candidates before saving.
            </p>
            <h3>2. Understand what’s worth it</h3>
            <p>
              Open a subscription to add usage evidence or research
              alternatives. Browser visits are a partial signal; storage, mobile
              use, and shared accounts matter too.
            </p>
            <h3>3. Make an informed change</h3>
            <p>
              Review the exact plan, cost, and consequences. Demo execution uses
              real Kernel browsers operating isolated merchant test pages. It
              never changes your real accounts.
            </p>
            <h3>Your monthly numbers</h3>
            <p>
              Average monthly cost divides annual plans by twelve. Scheduled
              payments show the full amount in the renewal month. Neither is a
              bank balance.
            </p>
          </div>
        </Modal>
      )}
      {selectedCurrent && (
        <SubscriptionDetail
          dismissedIds={data?.dismissedOpportunityIds ?? []}
          onDismiss={setOpportunityDismissed}
          dismissing={dismissing !== null}
          sub={selectedCurrent}
          recommendation={allRecs.find(
            (r) => r.subscriptionId === selectedCurrent.id,
          )}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selectedCurrent);
            setSelected(null);
            setModal("add");
          }}
          onPrepare={(kind) => void prepare(selectedCurrent, kind)}
          busy={busy}
          onRefresh={refresh}
          onNotify={notify}
        />
      )}
      {action && (
        <Modal
          title={
            action.status === "awaiting_approval"
              ? "Review your exact change"
              : "Your change, step by step"
          }
          onClose={() => setAction(null)}
          wide
        >
          <div className="modal-body">
            <div className="notice sandbox">
              <ShieldCheck size={19} />
              <span>
                <strong>Controlled test account</strong> · This runs in an
                isolated merchant sandbox. Your real subscription and spending
                totals stay unchanged.
              </span>
            </div>
            <div className="action-title">
              <h3>{actionNames[action.kind]}</h3>
              <span>{action.subscriptionName}</span>
            </div>
            <div className="comparison">
              <div>
                <span>CURRENT TEST PLAN</span>
                <h3>{action.fromPlan}</h3>
                <strong>
                  {money(action.fromPrice)}
                  <small>
                    {" "}
                    / {action.fromCycle === "yearly" ? "year" : "month"}
                  </small>
                </strong>
              </div>
              <ArrowRight size={22} />
              <div>
                <span>AFTER THIS CHANGE</span>
                <h3>{action.toPlan}</h3>
                <strong>
                  {money(action.toPrice)}
                  <small>
                    {" "}
                    / {action.toCycle === "yearly" ? "year" : "month"}
                  </small>
                </strong>
              </div>
            </div>
            <div className="action-consequences">
              <span>
                <CalendarDays size={16} />
                Effective {dateLabel(action.effectiveDate)}
              </span>
              <p>{action.consequence}</p>
              <small>
                These are illustrative sandbox terms, not a verified offer from
                the real merchant.
              </small>
            </div>
            {action.status === "awaiting_approval" ? (
              <div className="action-buttons">
                <button
                  className="button secondary"
                  onClick={() => setAction(null)}
                >
                  Keep as is
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await post(`/api/actions/${action.id}/approve`);
                      setAction(await api<Action>(`/api/actions/${action.id}`));
                      await refresh();
                    } catch (e) {
                      notify((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}
                  Approve this test change
                </button>
              </div>
            ) : (
              <ActionProgress action={action} />
            )}
          </div>
        </Modal>
      )}
      {chat && (
        <Suspense fallback={null}>
          <AgentChat onClose={() => setChat(false)} />
        </Suspense>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
  green = false,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  icon: React.ReactNode;
  green?: boolean;
}) {
  return (
    <section className={`metric-card ${green ? "green-card" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </section>
  );
}
function SubscriptionForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Subscription | null;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form);
    try {
      await api(
        initial ? `/api/subscriptions/${initial.id}` : "/api/subscriptions",
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify({
            ...body,
            price: Number(body.price),
            currency: "USD",
          }),
        },
      );
      await onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={initial ? "Edit subscription" : "Add a subscription"}
      onClose={onClose}
    >
      <form className="modal-body form-grid" onSubmit={submit}>
        <p className="small-note span-two">Fields marked * are required.</p>
        <label className="span-two">
          Service name *
          <input
            autoFocus
            name="name"
            placeholder="e.g. Spotify"
            defaultValue={initial?.name}
            required
            maxLength={100}
          />
        </label>
        <label className="span-two">
          Website domain (optional)
          <input
            name="domain"
            placeholder="e.g. spotify.com"
            defaultValue={initial?.domain}
            maxLength={160}
          />
        </label>
        <label className="span-two">
          Plan *
          <input
            name="plan"
            placeholder="e.g. Premium Individual"
            defaultValue={initial?.plan}
            required
            maxLength={100}
          />
        </label>
        <label>
          Price (USD) *
          <input
            type="number"
            name="price"
            min="0"
            max="100000"
            step="0.01"
            placeholder="11.99"
            defaultValue={initial?.price}
            required
          />
        </label>
        <label>
          Billing cycle
          <select name="cycle" defaultValue={initial?.cycle || "monthly"}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>
          Next payment *
          <input
            type="date"
            name="nextBilling"
            defaultValue={initial?.nextBilling || today()}
            required
          />
        </label>
        <label>
          Category
          <select
            name="category"
            defaultValue={initial?.category || "Productivity"}
          >
            {categories.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="span-two">
          Notes <span className="optional">Optional</span>
          <textarea
            name="notes"
            defaultValue={initial?.notes}
            placeholder="Anything you’d like to remember"
            maxLength={3000}
          />
        </label>
        {error && (
          <div className="notice error span-two" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions span-two">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={saving}>
            {saving && <Loader2 size={16} className="spin" />}
            {initial ? "Save changes" : "Add subscription"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (message: string) => Promise<void>;
}) {
  const [type, setType] = useState<"csv" | "email" | "browser">("csv"),
    [text, setText] = useState(""),
    [candidates, setCandidates] = useState<Subscription[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (gmail = false) => {
    setBusy(true);
    setError("");
    try {
      if (type === "browser") {
        const b = JSON.parse(text);
        const r = await post("/api/import/browser", b);
        await onSave(`Usage evidence added to ${r.count} subscriptions.`);
      } else {
        const r = await post<{ candidates: Subscription[] }>(
          gmail ? "/api/gmail/import" : "/api/import/parse",
          gmail ? {} : { text, type },
        );
        setCandidates(r.candidates);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        candidates
          ? "Review imported subscriptions"
          : "Bring your subscriptions together"
      }
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        {!candidates ? (
          <>
            <div className="segmented-control">
              {(["csv", "email", "browser"] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={type === t}
                  className={type === t ? "active" : ""}
                  onClick={() => {
                    setType(t);
                    setError("");
                  }}
                >
                  {t === "csv"
                    ? "Card CSV"
                    : t === "email"
                      ? "Receipt emails"
                      : "Browser activity"}
                </button>
              ))}
            </div>
            <p className="muted">
              {type === "csv"
                ? "Use merchant, amount, and date columns. Review detected subscriptions before importing."
                : type === "email"
                  ? "Paste receipts or upload an .eml file, then review detected subscriptions."
                  : "Import the JSON summary from the Folio browser extension. Only matching subscription domains are added."}
            </p>
            <label className="upload-zone">
              <Upload size={25} />
              <strong>Choose a file, or paste below</strong>
              <span>
                {type === "csv"
                  ? ".csv files"
                  : type === "email"
                    ? ".eml or .txt files"
                    : ".json files"}{" "}
                · Up to 1.5 MB
              </span>
              <input
                type="file"
                accept={
                  type === "csv"
                    ? ".csv"
                    : type === "email"
                      ? ".eml,.txt"
                      : ".json"
                }
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 1500000) {
                    setError("Please choose a file under 1.5 MB.");
                    return;
                  }
                  setText(await f.text());
                }}
              />
            </label>
            <textarea
              className="import-textarea"
              aria-label="Import content"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                type === "csv"
                  ? "merchant,amount,date\nSpotify,11.99,2026-09-09\nSpotify,11.99,2026-10-09"
                  : type === "email"
                    ? "Paste the receipt text here…"
                    : "Paste your browser activity summary here…"
              }
            />
            {type === "csv" && (
              <button
                className="text-button"
                onClick={() =>
                  download(
                    "folio-import-template.csv",
                    "merchant,amount,date,cycle,currency\nExample Service,12.99,2026-10-01,monthly,USD\n",
                  )
                }
              >
                Download CSV template
              </button>
            )}
            {type === "email" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void run(true)}
              >
                Import from connected Gmail
              </button>
            )}
          </>
        ) : (
          <>
            <p className="muted">
              Confirm names, charges, and billing dates. A recurring charge is a
              candidate, not proof of a subscription. Exact duplicates are
              skipped.
            </p>
            <div className="import-candidates">
              {candidates.map((c, i) => (
                <div className="import-candidate" key={c.id}>
                  <div className="candidate-heading">
                    <strong>{c.name}</strong>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${c.name} from import`}
                      onClick={() =>
                        setCandidates(candidates.filter((_, n) => n !== i))
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <label>
                      Service
                      <input
                        value={c.name}
                        onChange={(e) =>
                          setCandidates(
                            candidates.map((x, n) =>
                              n === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Amount (USD)
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={c.price}
                        onChange={(e) =>
                          setCandidates(
                            candidates.map((x, n) =>
                              n === i
                                ? { ...x, price: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Cycle
                      <select
                        value={c.cycle}
                        onChange={(e) =>
                          setCandidates(
                            candidates.map((x, n) =>
                              n === i
                                ? {
                                    ...x,
                                    cycle: e.target.value as
                                      "monthly" | "yearly",
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </label>
                    <label>
                      Next payment *
                      <input
                        type="date"
                        value={c.nextBilling}
                        onChange={(e) =>
                          setCandidates(
                            candidates.map((x, n) =>
                              n === i
                                ? { ...x, nextBilling: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <p>{c.notes}</p>
                </div>
              ))}
              {candidates.length === 0 && (
                <div className="notice">
                  No subscriptions to add. Try a different file.
                </div>
              )}
            </div>
          </>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => (candidates ? setCandidates(null) : onClose())}
          >
            {candidates ? "Back" : "Cancel"}
          </button>
          <button
            className="button primary"
            disabled={
              busy || (!candidates && !text.trim()) || candidates?.length === 0
            }
            onClick={async () => {
              if (!candidates) {
                await run();
                return;
              }
              setBusy(true);
              setError("");
              try {
                const r = await post("/api/import/confirm", {
                  subscriptions: candidates,
                  source: type === "csv" ? "CSV" : "Email",
                });
                await onSave(
                  `${r.count} subscriptions imported. Exact duplicates were skipped.`,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 size={16} className="spin" />}
            {candidates
              ? `Add ${candidates.length} subscriptions`
              : type === "browser"
                ? "Import usage"
                : "Find subscriptions"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function Connections({
  integrations,
  onClose,
  onImport,
  onNotify,
}: {
  integrations: Integration[];
  onClose: () => void;
  onImport: () => void;
  onNotify: (s: string) => void;
}) {
  return (
    <Modal title="Connections" onClose={onClose} wide>
      <div className="modal-body">
        <div className="connection-list">
          {integrations.map((i) => (
            <div className="connection" key={i.id}>
              <span className={`connection-icon ${i.id}`}>
                {i.id === "gmail" ? (
                  <FileText size={21} />
                ) : i.id === "extension" ? (
                  <Globe size={21} />
                ) : i.id === "gateway" ? (
                  <Sparkles size={21} />
                ) : i.id === "kernel" ? (
                  <Layers3 size={21} />
                ) : (
                  <Link2 size={21} />
                )}
              </span>
              <div>
                <strong>{i.name}</strong>
                <p>{i.description}</p>
                <small>{i.status}</small>
              </div>
              {i.id === "gmail" ? (
                <button
                  className="button secondary compact"
                  onClick={async () => {
                    if (!i.configured) {
                      onImport();
                      return;
                    }
                    try {
                      const r = await api<{ url: string }>(
                        "/api/gmail/connect",
                      );
                      window.location.assign(r.url);
                    } catch (e) {
                      onNotify((e as Error).message);
                    }
                  }}
                >
                  {i.configured ? "Connect" : "Import emails"}
                </button>
              ) : i.id === "extension" ? (
                <a
                  className="button secondary compact"
                  href="/folio-extension.zip"
                  download
                >
                  Download
                </a>
              ) : (
                <span className={`badge ${i.configured ? "green" : "gray"}`}>
                  {i.configured ? (
                    <Check size={13} />
                  ) : (
                    <CircleHelp size={13} />
                  )}{" "}
                  {i.configured ? "Configured" : "Not connected"}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="notice">
          <CreditCard size={19} />
          <span>
            Have a card statement? Import a CSV without connecting your bank.
          </span>
          <button className="text-button" onClick={onImport}>
            Import
          </button>
        </div>
        <p className="small-note">
          Browser extension: unzip, open chrome://extensions, enable Developer
          mode, and choose Load unpacked. It requests history access only when
          you generate a summary.
        </p>
      </div>
    </Modal>
  );
}
function SubscriptionDetail({
  sub,
  recommendation,
  dismissedIds,
  onDismiss,
  dismissing,
  onClose,
  onEdit,
  onPrepare,
  busy,
  onRefresh,
  onNotify,
}: {
  sub: Subscription;
  recommendation?: Recommendation;
  dismissedIds: string[];
  onDismiss: (id: string, dismissed: boolean) => Promise<void>;
  dismissing: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPrepare: (kind: ActionKind) => void;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  const focusRef = useDrawerFocus();
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [tab, setTab] = useState("overview"),
    [research, setResearch] = useState<{
      summary: string;
      sources: { title: string; url: string }[];
      checkedAt: string;
    } | null>(null),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const saveEvidence = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setWorking(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await post(`/api/subscriptions/${sub.id}/evidence`, {
        summary: f.get("summary"),
        usage: Number(f.get("usage")),
        limit: f.get("limit") ? Number(f.get("limit")) : undefined,
        days: Number(f.get("days")),
        source: "Self-reported",
      });
      await onRefresh();
      onNotify("Usage evidence saved.");
      setTab("overview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={focusRef}
        tabIndex={-1}
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${sub.name} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-toolbar">
          <span>Subscription details</span>
          <button
            className="icon-button"
            aria-label="Close subscription details"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <div className="detail-hero">
          <Logo sub={sub} />
          <div>
            <h2>{sub.name}</h2>
            <p>
              {sub.plan}{" "}
              <span>
                · {sub.source === "Demo" ? "Demo subscription" : sub.source}
              </span>
            </p>
          </div>
          <button className="button secondary compact" onClick={onEdit}>
            Edit
          </button>
        </div>
        <div className="detail-tabs">
          {["overview", "usage", "alternatives", "actions"].map((t) => (
            <button
              aria-pressed={tab === t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="detail-content">
          {tab === "overview" && (
            <>
              <div className="detail-price">
                <strong>{money(sub.price)}</strong>
                <span>per {sub.cycle === "yearly" ? "year" : "month"}</span>
                <UsageBadge sub={sub} />
              </div>
              <div className="detail-facts">
                <div>
                  <span>Next payment</span>
                  <strong>{dateLabel(sub.nextBilling)}</strong>
                </div>
                <div>
                  <span>Monthly equivalent</span>
                  <strong>{money(monthly(sub))}</strong>
                </div>
                <div>
                  <span>Category</span>
                  <strong>{sub.category}</strong>
                </div>
                <div>
                  <span>Website</span>
                  <strong>{sub.domain || "Not provided"}</strong>
                </div>
              </div>
              {recommendation && !dismissedIds.includes(recommendation.id) && (
                <div className="detail-recommendation">
                  <Sparkles size={21} />
                  <h3>{recommendation.title}</h3>
                  <p>{recommendation.detail}</p>
                  {recommendation.savings > 0 && (
                    <strong>
                      {money(recommendation.savings)} / month potential savings
                    </strong>
                  )}
                  <button
                    className="button primary full"
                    onClick={() => onPrepare(recommendation.kind)}
                    disabled={busy}
                  >
                    Review test change <ArrowUpRight size={16} />
                  </button>
                  <button
                    className="text-button dismiss-opportunity"
                    disabled={dismissing}
                    onClick={() => void onDismiss(recommendation.id, true)}
                  >
                    {dismissing ? "Dismissing…" : "Dismiss opportunity"}
                  </button>
                  <small>{recommendation.caveat}</small>
                </div>
              )}
              {recommendation && dismissedIds.includes(recommendation.id) && (
                <div className="dismissed-opportunity" role="status">
                  <div>
                    <strong>Opportunity dismissed</strong>
                    <p>Hidden from your savings suggestions.</p>
                  </div>
                  <button
                    className="text-button"
                    disabled={dismissing}
                    onClick={() => void onDismiss(recommendation.id, false)}
                  >
                    {dismissing ? "Restoring…" : "Restore opportunity"}
                  </button>
                </div>
              )}
              <div className="detail-section-heading">
                <h3>What we know</h3>
                <button className="text-button" onClick={() => setTab("usage")}>
                  Add evidence
                </button>
              </div>
              {sub.evidence.length ? (
                sub.evidence.map((e) => (
                  <div className="evidence" key={e.id}>
                    <span className="evidence-icon">
                      <FileText size={17} />
                    </span>
                    <div>
                      <strong>
                        {e.source}
                        <span>{e.confidence} confidence</span>
                      </strong>
                      <p>{e.summary}</p>
                      <small>
                        {dateLabel(e.observedAt)} · {e.days || 30}-day
                        observation
                        {sub.source === "Demo" ? " · Sample data" : ""}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="notice">
                  No usage evidence yet. Unknown usage does not mean unused.
                </div>
              )}
              {sub.notes && <p className="small-note">{sub.notes}</p>}
              <div className="remove-subscription">
                {removeConfirm ? (
                  <div className="notice">
                    <span>
                      Remove this record from Folio? This does not cancel your
                      subscription.
                    </span>
                    <button
                      className="text-button"
                      disabled={working}
                      onClick={async () => {
                        setWorking(true);
                        try {
                          await api(`/api/subscriptions/${sub.id}`, {
                            method: "DELETE",
                          });
                          await onRefresh();
                          onClose();
                          onNotify("Subscription removed from Folio.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setWorking(false);
                        }
                      }}
                    >
                      Remove
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setRemoveConfirm(false)}
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-button"
                    onClick={() => setRemoveConfirm(true)}
                  >
                    Remove from Folio
                  </button>
                )}
              </div>
            </>
          )}
          {tab === "usage" && (
            <>
              <AccountInspection
                subscriptionId={sub.id}
                onRefresh={onRefresh}
              />
              <h3>What does useful look like for you?</h3>
              <p className="muted">
                Add meaningful activity: listening days, projects, credits, or
                storage used. Include mobile and shared-account use.
              </p>
              <form className="form-grid" onSubmit={saveEvidence}>
                <label className="span-two">
                  Describe your usage
                  <textarea
                    name="summary"
                    required
                    placeholder="e.g. Used for 2 work projects this month; also shared with my partner."
                    maxLength={2000}
                  />
                </label>
                <label>
                  Amount used
                  <input
                    type="number"
                    name="usage"
                    required
                    min="0"
                    step="any"
                    placeholder="2"
                  />
                </label>
                <label>
                  Plan allowance <span className="optional">Optional</span>
                  <input
                    type="number"
                    name="limit"
                    min="0.01"
                    step="any"
                    placeholder="20"
                  />
                </label>
                <label className="span-two">
                  Observation period
                  <select name="days">
                    <option value="30">Last 30 days</option>
                    <option value="7">Last 7 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </label>
                <div className="notice span-two">
                  Your input is recorded as self-reported evidence. Browser
                  activity can be imported from Connections.
                </div>
                <button className="button primary span-two" disabled={working}>
                  {working && <Loader2 className="spin" size={16} />}Save usage
                  evidence
                </button>
              </form>
            </>
          )}
          {tab === "alternatives" && (
            <>
              <span className="large-icon">
                <Globe size={27} />
              </span>
              <h3>A better fit might be out there.</h3>
              <p className="muted">
                Research current plans and alternatives with Exa. Folio compares
                the results against your usage and highlights what you’d give
                up.
              </p>
              <button
                className="button primary"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  setError("");
                  try {
                    setResearch(
                      await post(`/api/subscriptions/${sub.id}/research`),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                {working ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}{" "}
                {research ? "Refresh research" : "Research alternatives"}
              </button>
              {research && (
                <div className="research-results">
                  <p className="research-summary">{research.summary}</p>
                  <h4>Sources checked</h4>
                  {research.sources.map((s) => (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      key={s.url}
                    >
                      {s.title}
                      <ExternalLink size={14} />
                    </a>
                  ))}
                  <small>
                    Checked {new Date(research.checkedAt).toLocaleString()}
                  </small>
                </div>
              )}
            </>
          )}
          {tab === "actions" && (
            <>
              <h3>You choose. Folio takes care of the steps.</h3>
              <p className="muted">
                Preview the exact change before approving. For this demo, all
                actions run in an isolated merchant test account.
              </p>
              <div className="action-options">
                {(["cancel", "downgrade", "yearly", "migrate"] as const).map(
                  (kind) => (
                    <button
                      disabled={busy}
                      onClick={() => onPrepare(kind)}
                      key={kind}
                    >
                      <span>
                        {kind === "cancel" ? (
                          <LogOut size={20} />
                        ) : kind === "downgrade" ? (
                          <TrendingDown size={20} />
                        ) : kind === "yearly" ? (
                          <CalendarDays size={20} />
                        ) : (
                          <ArrowRight size={20} />
                        )}
                      </span>
                      <div>
                        <strong>{actionNames[kind]}</strong>
                        <p>
                          {kind === "cancel"
                            ? "End a subscription you no longer need"
                            : kind === "downgrade"
                              ? "Move to a smaller plan"
                              : kind === "yearly"
                                ? "Review annual pricing and commitment"
                                : "Export, import, and verify your data"}
                        </p>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ),
                )}
              </div>
              <div className="notice">
                <ShieldCheck size={20} />
                <span>
                  Only the exact change you approve can proceed. Folio verifies
                  the merchant’s final state.
                </span>
              </div>
            </>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function AccountInspection({
  subscriptionId,
  onRefresh,
}: {
  subscriptionId: string;
  onRefresh: () => Promise<void>;
}) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<{
      summary: string;
      usage: number | null;
      limit: number | null;
      days: number | null;
    } | null>(null);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="account-inspection">
      <h3>Read your account’s own evidence</h3>
      <p>
        Open a private browser, sign in yourself, and navigate to a usage or
        activity page. Folio reads the page you choose and asks you to review
        the evidence.
      </p>
      {!url ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await post(
                `/api/subscriptions/${subscriptionId}/inspect/start`,
              );
              setUrl(r.liveViewUrl);
            })
          }
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Globe size={16} />}
          Open account browser
        </button>
      ) : (
        <>
          <a
            className="button primary"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            Open private browser <ExternalLink size={14} />
          </a>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setDraft(
                  await post(
                    `/api/subscriptions/${subscriptionId}/inspect/capture`,
                  ),
                );
              })
            }
          >
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <FileText size={16} />
            )}
            Read current page
          </button>
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                await post("/api/inspect/close");
                setUrl("");
                setDraft(null);
              })
            }
          >
            Close browser session
          </button>
        </>
      )}
      {draft && (
        <div className="notice">
          <div>
            <p>{draft.summary}</p>
            <p>
              {draft.usage === null
                ? "No explicit usage metric found."
                : `Observed usage: ${draft.usage}${draft.limit ? ` of ${draft.limit}` : ""}`}
            </p>
            <button
              className="button secondary compact"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post(
                    `/api/subscriptions/${subscriptionId}/inspect/save`,
                  );
                  await onRefresh();
                  setDraft(null);
                  setUrl("");
                })
              }
            >
              Save this evidence
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
