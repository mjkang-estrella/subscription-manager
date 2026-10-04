import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  LayoutDashboard,
  Layers3,
  CalendarDays,
  Sparkles,
  Activity,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  CircleHelp,
  Bell,
  X,
  Check,
  Loader2,
  Leaf,
  ShieldCheck,
  Menu,
  Wallet,
  Clock3,
  FileText,
  Settings2,
  FlaskConical,
  UserRound,
} from "lucide-react";
import type {
  Subscription,
  Workspace,
  Action,
  Integration,
} from "../shared/types";
import {
  money,
  monthly,
  recommendations,
  today,
} from "../shared/domain";
import { api, post } from "./api";
import { Modal, Logo } from "./components";
import { SubscriptionComposition } from "./SubscriptionComposition";
import { SubscriptionList } from "./SubscriptionList";
import { SubscriptionDetail, type DetailTab } from "./SubscriptionDetail";
import { SubscriptionForm } from "./SubscriptionForm";
import { AddDataChooser, ImportFlow } from "./ImportFlow";
import { ActionDialog } from "./ActionDialog";
import { RenewalDecisions, SinceLastVisit } from "./Renewals";
import { WorkspacePanel } from "./WorkspacePanel";
import { HelpPanel } from "./HelpPanel";
import {
  actionNames,
  dateLabel,
  download,
  errorText,
  monthName,
  per,
  relativeDays,
} from "./format";
import {
  current as currentSubs,
  latestOutcomes,
  savingsSummary,
  scheduledInMonth,
  sinceLastVisit,
  subscriptionsCsv,
  upcoming,
  visitHasNews,
} from "./model";
const AgentChat = lazy(() => import("./AgentChat"));

const NAV = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "subscriptions", name: "Subscriptions", icon: Layers3 },
  { id: "calendar", name: "Payment calendar", icon: CalendarDays },
  { id: "savings", name: "Savings", icon: Sparkles },
  { id: "activity", name: "Agent activity", icon: Activity },
] as const;
type Page = (typeof NAV)[number]["id"];
type ModalKind =
  | "add-data"
  | "csv"
  | "email"
  | "manual"
  | "edit"
  | "start-personal"
  | "workspace"
  | "help"
  | null;
type AddChoice = "csv" | "email" | "manual";

type VisitResponse = { previousVisitAt?: string; workspace: Workspace };
let visitRequest: Promise<VisitResponse> | null = null;
/**
 * One visit per page load powers the "since" summary. StrictMode mounts effects
 * twice in development, and a second POST would overwrite previousVisitAt with
 * this load's own timestamp, so the request is shared at module scope.
 */
const recordVisitOnce = () =>
  (visitRequest ??= post<VisitResponse>("/api/workspace/visit"));

export default function App() {
  const [data, setData] = useState<Workspace | null>(null),
    [loadError, setLoadError] = useState(""),
    [page, setPage] = useState<Page>("overview"),
    [sidebar, setSidebar] = useState(false),
    [modal, setModal] = useState<ModalKind>(null),
    [afterPersonal, setAfterPersonal] = useState<AddChoice | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [detailTab, setDetailTab] = useState<DetailTab>("overview"),
    [chat, setChat] = useState(false),
    [toast, setToast] = useState(""),
    [integrations, setIntegrations] = useState<Integration[]>([]),
    [openAction, setOpenAction] = useState<Action | null>(null),
    [monthOffset, setMonthOffset] = useState(0),
    [previousVisitAt, setPreviousVisitAt] = useState<string>(),
    [visitDismissed, setVisitDismissed] = useState(false),
    [dismissing, setDismissing] = useState<string | null>(null);
  const notify = useCallback((s: string) => setToast(s), []);

  const refresh = useCallback(async () => {
    try {
      setData(await api<Workspace>("/api/workspace"));
      setLoadError("");
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);

  useEffect(() => {
    recordVisitOnce()
      .then((r) => {
        setData(r.workspace);
        setPreviousVisitAt(r.previousVisitAt);
      })
      .catch(() => void refresh());
    api<Integration[]>("/api/integrations")
      .then(setIntegrations)
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);

  // Running actions keep polling whether or not their dialog is open, including after reload.
  const runningIds = (data?.actions ?? [])
    .filter((a) => a.status === "running")
    .map((a) => a.id)
    .join(",");
  const openRef = useRef(openAction);
  openRef.current = openAction;
  useEffect(() => {
    if (!runningIds && openRef.current?.status !== "running") return;
    const ids = new Set(runningIds.split(",").filter(Boolean));
    if (openRef.current?.status === "running") ids.add(openRef.current.id);
    const t = setInterval(async () => {
      let changed = false;
      for (const id of ids) {
        try {
          const a = await api<Action>(`/api/actions/${id}`);
          if (openRef.current?.id === id) setOpenAction(a);
          setData((d) =>
            d && {
              ...d,
              actions: d.actions.map((x) => (x.id === a.id ? a : x)),
            },
          );
          if (a.status !== "running") changed = true;
        } catch {
          /* transient polling errors are retried on the next tick */
        }
      }
      if (changed) void refresh();
    }, 2500);
    return () => clearInterval(t);
  }, [runningIds, openAction?.status, refresh]);

  useEffect(() => {
    if (!openAction || !data) return;
    const fresh = data.actions.find((a) => a.id === openAction.id);
    if (fresh && fresh !== openAction && fresh.status !== openAction.status)
      setOpenAction(fresh);
  }, [data, openAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
    menu?.querySelector<HTMLElement>("a,button")?.focus();
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

  const asOf = today();
  const calendarMonth = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() + monthOffset);
  const month = calendarMonth.toISOString().slice(0, 7);
  const thisMonth = asOf.slice(0, 7);

  const demo = data?.mode === "demo";
  const active = data ? currentSubs(data, asOf) : [];
  const savings = useMemo(() => (data ? savingsSummary(data) : null), [data]);
  const recs = data
    ? recommendations(active, data.dismissedOpportunityIds ?? [])
    : [];
  const monthlyTotal = active.reduce((a, s) => a + monthly(s), 0);
  const thisMonthEntries = data ? scheduledInMonth(data, thisMonth) : [];
  const remainingThisMonth = thisMonthEntries.filter((e) => e.date >= asOf);
  const calendarEntries = data ? scheduledInMonth(data, month) : [];
  const calendarTotal = calendarEntries.reduce((a, e) => a + e.sub.price, 0);
  const comingUp = data ? upcoming(data, 30, asOf).slice(0, 5) : [];
  const visit = data ? sinceLastVisit(data, previousVisitAt, asOf) : null;
  const selected = selectedId
    ? data?.subscriptions.find((s) => s.id === selectedId) ?? null
    : null;
  const awaiting = data?.actions.some((a) => a.status === "awaiting_approval");
  const running = data?.actions.some((a) => a.status === "running");

  const open = (s: Pick<Subscription, "id">, tab: DetailTab = "overview") => {
    setDetailTab(tab);
    setSelectedId(s.id);
  };
  const navigate = (p: Page) => {
    setPage(p);
    setSidebar(false);
  };
  const startAdd = (choice?: AddChoice) => {
    setSidebar(false);
    if (data?.mode !== "personal") {
      setAfterPersonal(choice ?? null);
      setModal("start-personal");
      return;
    }
    setModal(choice ?? "add-data");
  };
  const startPersonal = async () => {
    await post("/api/workspace/personal");
    await refresh();
    notify("Your personal workspace is ready. Samples were removed.");
  };
  const setOpportunityDismissed = async (id: string, dismissed: boolean) => {
    setDismissing(id);
    try {
      setData(
        await post<Workspace>(
          `/api/opportunities/${encodeURIComponent(id)}/dismiss`,
          { dismissed },
        ),
      );
      notify(dismissed ? "Suggestion dismissed. Restore it from the subscription." : "Suggestion restored.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setDismissing(null);
    }
  };
  const exportCsv = () => {
    if (!data) return;
    download("folio-subscriptions.csv", subscriptionsCsv(data.subscriptions));
    notify("Your subscriptions have been exported.");
  };
  const showAction = (a: Action) => {
    setOpenAction(a);
    setSelectedId(null);
    void refresh();
  };

  const modeLabel = demo ? "Demo workspace" : "Personal workspace";
  const pageName = NAV.find((n) => n.id === page)?.name;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
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
            setModal("workspace");
          }}
        >
          <span className="workspace-avatar" aria-hidden="true">
            {demo ? <FlaskConical size={15} /> : <UserRound size={15} />}
          </span>
          <span>{data ? modeLabel : "Workspace"}</span>
          <Settings2 size={15} />
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
              setModal("help");
            }}
          >
            <CircleHelp size={18} />
            Help & connections
          </button>
          <button
            className="sidebar-link"
            onClick={() => {
              setSidebar(false);
              setModal("workspace");
            }}
          >
            <ShieldCheck size={18} />
            Backup & privacy
          </button>
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
            <strong>{pageName}</strong>
          </div>
          <div className="topbar-right">
            {data && (
              <button
                className={`demo-pill ${demo ? "" : "personal"}`}
                onClick={() => setModal("workspace")}
              >
                <span />
                {modeLabel}
              </button>
            )}
            <button
              className="icon-button"
              aria-label={
                awaiting || running
                  ? "Agent activity: changes need attention"
                  : "View agent activity"
              }
              onClick={() => navigate("activity")}
            >
              <Bell size={19} />
              {(awaiting || running) && <i />}
            </button>
            <button
              className="icon-button topbar-assistant"
              aria-label="Ask Folio"
              onClick={() => {
                setSidebar(false);
                setChat(true);
              }}
            >
              <Sparkles size={19} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1>{pageName}</h1>
            </div>
            <div className="heading-actions">
              <button className="button primary" onClick={() => startAdd()}>
                <Plus size={17} />
                Add data
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
            data &&
            savings && (
              <div className={`page page-${page}`}>
                {page === "overview" && visit && visitHasNews(visit) && !visitDismissed && (
                  <SinceLastVisit
                    summary={visit}
                    onOpen={(s) => open(s)}
                    onDismiss={() => setVisitDismissed(true)}
                  />
                )}
                {(page === "overview" || page === "subscriptions") && (
                  <div className="metrics">
                    <Metric
                      label="Average monthly cost"
                      value={money(monthlyTotal)}
                      icon={<Wallet size={19} />}
                      detail={<>{money(monthlyTotal * 12)} a year</>}
                    />
                    <Metric
                      label="Scheduled this month"
                      value={money(remainingThisMonth.reduce((a, e) => a + e.sub.price, 0))}
                      icon={<CalendarDays size={19} />}
                      detail={
                        <>
                          {remainingThisMonth.length} still to come in{" "}
                          {monthName(new Date(`${thisMonth}-01T12:00:00Z`), true)}
                        </>
                      }
                    />
                    <Metric
                      label="Active subscriptions"
                      value={String(active.length)}
                      icon={<Layers3 size={19} />}
                      detail={
                        active.some((s) => s.status === "cancel_pending")
                          ? `${active.filter((s) => s.status === "cancel_pending").length} ending`
                          : undefined
                      }
                    />
                    <Metric
                      green
                      label="Potential monthly savings"
                      value={money(savings.potential)}
                      icon={<Sparkles size={19} />}
                      detail={
                        <button
                          className="metric-link"
                          onClick={() => navigate("savings")}
                        >
                          {savings.demoPotential > 0 ? "Demo estimate · " : ""}
                          {savings.opportunities} to review
                          <ArrowUpRight size={14} />
                        </button>
                      }
                    />
                  </div>
                )}
                {(page === "overview" || page === "savings") && (
                  <RecordedStrip savings={savings} demo={demo} />
                )}
                {page === "overview" && (
                  <div className="overview-grid">
                    <section className="panel spending-panel">
                      <div className="panel-heading">
                        <h2>Subscription breakdown</h2>
                      </div>
                      <SubscriptionComposition
                        subscriptions={active}
                        onSelect={(s) => open(s)}
                      />
                      <div className="chart-footer composition-footer">
                        <span>Annual plans divided by 12</span>
                      </div>
                    </section>
                    <RenewalDecisions
                      workspace={data}
                      onOpen={(s) => open(s)}
                      onRefresh={refresh}
                      onNotify={notify}
                    />
                  </div>
                )}
                {(page === "overview" || page === "subscriptions") && (
                  <div className={page === "overview" ? "lower-grid" : ""}>
                    <SubscriptionList
                      subscriptions={data.subscriptions}
                      onOpen={(s) => open(s)}
                      onAddData={() => startAdd()}
                      onExport={exportCsv}
                    />
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
                            {comingUp.map(({ sub: s, date }) => (
                              <button key={`${s.id}-${date}`} onClick={() => open(s)}>
                                <Logo sub={s} small />
                                <div>
                                  <strong>{s.name}</strong>
                                  <small>
                                    {dateLabel(date)} · {relativeDays(asOf, date)}
                                  </small>
                                </div>
                                <strong>{money(s.price)}</strong>
                              </button>
                            ))}
                            {!comingUp.length && (
                              <p className="muted">No renewals in the next 30 days.</p>
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
                        <h2>{monthName(new Date(`${month}-01T12:00:00Z`))}</h2>
                        <p>
                          {money(calendarTotal)} projected across{" "}
                          {calendarEntries.length} renewal
                          {calendarEntries.length === 1 ? "" : "s"}
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
                    <div className="calendar-week" aria-hidden="true">
                      {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                    <div className="calendar-grid">
                      {Array.from({ length: calendarMonth.getUTCDay() }, (_, i) => (
                        <div className="calendar-day outside" key={`empty-${i}`} />
                      ))}
                      {Array.from(
                        {
                          length: new Date(
                            Date.UTC(
                              calendarMonth.getUTCFullYear(),
                              calendarMonth.getUTCMonth() + 1,
                              0,
                            ),
                          ).getUTCDate(),
                        },
                        (_, i) => {
                          const day = `${month}-${String(i + 1).padStart(2, "0")}`;
                          const entries = calendarEntries.filter((x) => x.date === day);
                          return (
                            <div
                              className={`calendar-day ${day === asOf ? "today" : ""} ${entries.length ? "has-payments" : ""}`}
                              key={day}
                            >
                              <span className="day-number">{i + 1}</span>
                              {entries.map(({ sub: s }) => (
                                <button
                                  key={s.id}
                                  onClick={() => open(s)}
                                  aria-label={`${s.name}, ${money(s.price)} on ${dateLabel(day)}`}
                                  style={
                                    { "--payment-color": s.color } as React.CSSProperties
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
                    <div className="calendar-foot">
                      <p className="calendar-disclaimer">
                        Projected from your billing dates, not confirmed bank
                        charges.
                      </p>
                      <button
                        className="button secondary compact"
                        onClick={() => setModal("workspace")}
                      >
                        <CalendarDays size={15} />
                        Add to my calendar app
                      </button>
                    </div>
                  </section>
                )}
                {page === "savings" && (
                  <SavingsPage
                    workspace={data}
                    recs={recs}
                    potential={savings.potential}
                    demoPotential={savings.demoPotential}
                    dismissing={dismissing}
                    onOpen={open}
                    onDismiss={setOpportunityDismissed}
                    onNavigate={navigate}
                  />
                )}
                {page === "activity" && (
                  <ActivityPage
                    workspace={data}
                    onOpenAction={setOpenAction}
                    onNavigate={navigate}
                  />
                )}
                <footer className="page-footer">
                  <span>
                    {demo
                      ? "Sample subscriptions and illustrative prices · No real accounts changed"
                      : "Private workspace · USD"}
                  </span>
                </footer>
              </div>
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
      {modal === "start-personal" && data && (
        <StartPersonal
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await startPersonal();
            setModal(afterPersonal ?? "add-data");
            setAfterPersonal(null);
          }}
        />
      )}
      {modal === "add-data" && (
        <AddDataChooser onClose={() => setModal(null)} onChoose={(c) => setModal(c)} />
      )}
      {(modal === "csv" || modal === "email") && data && (
        <ImportFlow
          kind={modal}
          subscriptions={data.subscriptions}
          integrations={integrations}
          onClose={() => setModal(null)}
          onDone={async (message) => {
            await refresh();
            setModal(null);
            notify(message);
          }}
        />
      )}
      {(modal === "manual" || (modal === "edit" && selected)) && (
        <SubscriptionForm
          initial={modal === "edit" ? selected : null}
          onClose={() => setModal(null)}
          onSave={async () => {
            await refresh();
            notify(modal === "edit" ? "Subscription updated." : "Subscription added.");
            setModal(null);
          }}
        />
      )}
      {modal === "workspace" && data && (
        <WorkspacePanel
          workspace={data}
          onClose={() => setModal(null)}
          onWorkspace={(ws) => {
            setData(ws);
            setSelectedId(null);
            setOpenAction(null);
          }}
          onStartPersonal={async () => {
            await startPersonal();
            setModal(null);
          }}
          onNotify={notify}
        />
      )}
      {modal === "help" && (
        <HelpPanel
          integrations={integrations}
          onClose={() => setModal(null)}
          onNotify={notify}
        />
      )}
      {selected && data && modal !== "edit" && (
        <SubscriptionDetail
          key={`${selected.id}-${detailTab}`}
          sub={selected}
          workspace={data}
          initialTab={detailTab}
          dismissing={dismissing !== null}
          onDismiss={setOpportunityDismissed}
          onClose={() => setSelectedId(null)}
          onEdit={() => setModal("edit")}
          onRefresh={refresh}
          onWorkspace={setData}
          onAction={showAction}
          onNotify={notify}
        />
      )}
      {openAction && data && (
        <ActionDialog
          action={openAction}
          workspace={data}
          onClose={() => setOpenAction(null)}
          onAction={(a) => {
            setOpenAction(a);
            void refresh();
          }}
          onWorkspace={setData}
          onRecordOwn={(id) => {
            setOpenAction(null);
            open({ id }, "change");
          }}
          onNotify={notify}
        />
      )}
      {chat && data && (
        <Suspense fallback={null}>
          <AgentChat
            onClose={() => setChat(false)}
            subscriptions={data.subscriptions}
            onOpenSubscription={(id) => {
              setChat(false);
              open({ id });
            }}
          />
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

function RecordedStrip({
  savings,
  demo,
}: {
  savings: ReturnType<typeof savingsSummary>;
  demo: boolean;
}) {
  const items: { label: string; value: number }[] = [];
  if (savings.recorded > 0)
    items.push({ label: "Recorded reductions", value: savings.recorded });
  if (savings.recordedProjected > 0)
    items.push({ label: "Recorded, takes effect later", value: savings.recordedProjected });
  if (demo && savings.demoApplied > 0)
    items.push({ label: "Demo ledger reductions", value: savings.demoApplied });
  if (!items.length) return null;
  return (
    <section className="recorded-strip" aria-label="Recorded monthly reductions">
      {items.map((i) => (
        <span key={i.label}>
          <Check size={14} />
          {i.label} <strong>{money(i.value)}/mo</strong>
        </span>
      ))}
      <small>From changes you recorded. Not bank-verified.</small>
    </section>
  );
}

function StartPersonal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Start your personal workspace" onClose={onClose}>
      <div className="modal-body">
        <p>
          Your own data goes in a personal workspace, so it never mixes with
          demo samples or illustrative savings. The samples are removed;
          anything you added yourself stays.
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button className="button secondary" onClick={onClose}>
            Keep exploring the demo
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onConfirm();
              } catch (e) {
                setError(errorText(e));
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="spin" size={16} />}
            Start personal workspace
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SavingsPage({
  workspace,
  recs,
  potential,
  demoPotential,
  dismissing,
  onOpen,
  onDismiss,
  onNavigate,
}: {
  workspace: Workspace;
  recs: ReturnType<typeof recommendations>;
  potential: number;
  demoPotential: number;
  dismissing: string | null;
  onOpen: (s: Subscription, tab?: DetailTab) => void;
  onDismiss: (id: string, dismissed: boolean) => Promise<void>;
  onNavigate: (p: Page) => void;
}) {
  const dismissedCount = (workspace.dismissedOpportunityIds ?? []).length;
  return (
    <>
      <div className="savings-summary">
        <span className="savings-icon">
          <Sparkles size={28} />
        </span>
        <div>
          <h2>
            {money(potential)} <small>potential monthly savings</small>
          </h2>
          <p className="muted">
            {demoPotential > 0
              ? "Demo estimate from illustrative test prices."
              : "Counts only prices you confirmed in the last 30 days."}
          </p>
        </div>
      </div>
      <div className="recommendations-grid">
        {recs.map((r) => {
          const s = workspace.subscriptions.find((x) => x.id === r.subscriptionId);
          if (!s) return null;
          const evidence = s.evidence.find((e) => e.id === r.evidenceId);
          return (
            <section className="panel recommendation-card" key={r.id}>
              <div className="rec-card-top">
                <Logo sub={s} />
                <span className="badge amber">{r.confidence} confidence</span>
              </div>
              <h2>{r.title}</h2>
              <p>{r.detail}</p>
              <div className="rec-saving">
                {r.savings > 0
                  ? `${money(r.savings)} / month`
                  : r.kind === "cancel"
                    ? `${money(monthly(s))} / month`
                    : "Price unconfirmed"}
                <span>
                  {r.savings > 0
                    ? r.illustrative
                      ? "demo estimate"
                      : "with confirmed terms"
                    : "confirm merchant terms to count savings"}
                </span>
              </div>
              {evidence && (
                <div className="rec-evidence">
                  <FileText size={16} />
                  <span>
                    {evidence.source} · {dateLabel(evidence.observedAt, true)}
                  </span>
                </div>
              )}
              <p className="rec-caveat">{r.caveat}</p>
              <button
                className="button primary full"
                onClick={() => onOpen(s, r.savings > 0 || r.kind === "cancel" ? "change" : "alternatives")}
              >
                {r.savings > 0 || r.kind === "cancel" ? "Review change" : "Confirm a price"}{" "}
                <ArrowUpRight size={16} />
              </button>
              <button
                className="text-button dismiss-opportunity"
                disabled={dismissing !== null}
                onClick={() => void onDismiss(r.id, true)}
              >
                {dismissing === r.id ? "Dismissing…" : "Dismiss"}
              </button>
            </section>
          );
        })}
        {!recs.length && (
          <div className="empty-state">
            <Sparkles size={30} />
            <h3>{dismissedCount ? "You’re all caught up." : "Nothing to suggest yet."}</h3>
            <p>
              {dismissedCount
                ? "Dismissed suggestions can be restored from each subscription."
                : "Add usage or a check-in. Missing data never means unused."}
            </p>
            <button className="button primary" onClick={() => onNavigate("subscriptions")}>
              Review subscriptions
            </button>
          </div>
        )}
      </div>
      <div className="notice">
        <ShieldCheck size={19} />
        <span>
          Potential savings aren’t money saved. Recorded reductions come only
          from changes you record yourself.
        </span>
      </div>
    </>
  );
}

function ActivityPage({
  workspace,
  onOpenAction,
  onNavigate,
}: {
  workspace: Workspace;
  onOpenAction: (a: Action) => void;
  onNavigate: (p: Page) => void;
}) {
  const outcomes = latestOutcomes(workspace.outcomes);
  return (
    <>
      <section className="panel activity-panel">
        <div className="panel-heading">
          <h2>Controlled test changes</h2>
          <span className="muted-tag">Hosted test merchant</span>
        </div>
        {workspace.actions.length ? (
          [...workspace.actions]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((a) => (
              <button
                className="activity-row"
                key={a.id}
                onClick={() => onOpenAction(a)}
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
                    {new Date(a.createdAt).toLocaleString()} · Test
                    {a.appliedAt ? " · Applied to demo ledger" : ""}
                  </small>
                </div>
                <span
                  className={`badge ${a.status === "completed" ? "green" : a.status === "failed" || a.status === "awaiting_approval" ? "amber" : "gray"}`}
                >
                  {a.status === "awaiting_approval" ? "needs approval" : a.status.replaceAll("_", " ")}
                </span>
                <ChevronRight size={17} />
              </button>
            ))
        ) : (
          <div className="empty-state">
            <Activity size={32} />
            <h3>Nothing happens without you.</h3>
            <p>Proposals you prepare and their results appear here.</p>
            <button className="button primary" onClick={() => onNavigate("savings")}>
              Explore savings
            </button>
          </div>
        )}
      </section>
      {outcomes.length > 0 && (
        <section className="panel activity-panel">
          <div className="panel-heading">
            <h2>Recorded changes</h2>
          </div>
          {outcomes.map((o) => (
            <div className="activity-row static" key={o.id}>
              <span className="activity-icon success">
                <Check size={21} />
              </span>
              <div>
                <strong>
                  {o.kind === "cancel" ? "Cancelled" : "Changed plan"} · {o.subscriptionName}
                </strong>
                <small>
                  {o.source === "demo" ? "Demo ledger" : "Recorded by you"} · effective{" "}
                  {dateLabel(o.effectiveDate, true)}
                  {o.kind === "plan"
                    ? ` · ${o.after.plan} ${money(o.after.price)}/${per(o.after.cycle)}`
                    : ""}
                </small>
              </div>
              <span className={`badge ${o.source === "demo" ? "gray" : "green"}`}>
                {money(o.monthlyReduction)}/mo
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
