import { useState, type FormEvent } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { PlanOffer, Subscription } from "../shared/types";
import { money, monthly, offerIsFresh } from "../shared/domain";
import { LONG_REQUEST, patch, post } from "./api";
import { dateLabel, errorText, per } from "./format";
import { safeHttpUrl } from "./model";

const KIND_LABEL: Record<PlanOffer["kind"], string> = {
  downgrade: "Lower plan",
  yearly: "Annual billing",
  migrate: "Alternative service",
};

export function offerProblem(
  sub: Subscription,
  o: Pick<PlanOffer, "kind" | "price" | "cycle">,
): string | undefined {
  if (!(o.price >= 0)) return "Enter a price.";
  if (o.kind === "yearly" && sub.cycle === "yearly")
    return "This subscription is already billed annually.";
  if (o.kind === "yearly" && o.cycle !== "yearly")
    return "An annual offer must be billed yearly.";
  if (monthly(o) >= monthly(sub))
    return `Not cheaper than ${money(monthly(sub), sub.currency)} a month, so it won’t be suggested.`;
  return undefined;
}

export function offerStatus(o: PlanOffer) {
  if (!o.confirmedAt)
    return { label: "Needs your confirmation", tone: "amber" };
  if (!offerIsFresh(o))
    return { label: "Price older than 30 days", tone: "gray" };
  return {
    label:
      o.provenance === "demo"
        ? "Illustrative demo terms"
        : `Confirmed ${dateLabel(o.confirmedAt)}`,
    tone: o.provenance === "demo" ? "gray" : "green",
  };
}

export function AlternativesPanel({
  sub,
  onRefresh,
  onNotify,
}: {
  sub: Subscription;
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirming, setConfirming] = useState<PlanOffer | null>(null),
    [manual, setManual] = useState(false);
  const research = sub.research;
  const confirmedIds = new Set(
    (sub.offers ?? []).filter((o) => o.confirmedAt).map((o) => o.id),
  );
  const extracted = (research?.plans ?? []).filter(
    (p) => !confirmedIds.has(p.id),
  );
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="research">
        <div className="detail-section-heading">
          <h3>Plans and alternatives</h3>
          <button
            className="button secondary compact"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await post(
                  `/api/subscriptions/${sub.id}/research`,
                  {},
                  LONG_REQUEST(),
                );
                await onRefresh();
              })
            }
          >
            {busy ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {research ? "Refresh research" : "Research with Exa"}
          </button>
        </div>
        {research ? (
          <div className="research-results">
            <p className="research-summary">{research.summary}</p>
            {research.sources.length > 0 && (
              <>
                <h4>Sources</h4>
                {research.sources.map((s) => {
                  const href = safeHttpUrl(s.url);
                  return href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      key={s.url}
                    >
                      {s.title || href}
                      <ExternalLink size={14} />
                    </a>
                  ) : null;
                })}
              </>
            )}
            <small>
              Checked {new Date(research.checkedAt).toLocaleString()}
            </small>
          </div>
        ) : (
          <p className="muted">
            Research runs only when you ask. Extracted prices need your
            confirmation before they count.
          </p>
        )}
      </section>

      {extracted.length > 0 && (
        <section>
          <h3 className="detail-subheading">Found in sources</h3>
          <ul className="offer-list">
            {extracted.map((p) => (
              <OfferRow key={p.id} sub={sub} offer={p}>
                <button
                  className="button secondary compact"
                  onClick={() => {
                    setManual(false);
                    setConfirming(p);
                  }}
                >
                  Check and confirm
                </button>
              </OfferRow>
            ))}
          </ul>
        </section>
      )}

      {(sub.offers ?? []).length > 0 && (
        <section>
          <h3 className="detail-subheading">Saved terms</h3>
          <ul className="offer-list">
            {sub.offers!.map((o) => (
              <OfferRow key={o.id} sub={sub} offer={o}>
                {!offerIsFresh(o) && o.provenance !== "demo" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setManual(false);
                      setConfirming(o);
                    }}
                  >
                    Reconfirm
                  </button>
                )}
              </OfferRow>
            ))}
          </ul>
        </section>
      )}

      {confirming || manual ? (
        <OfferForm
          key={confirming?.id ?? "manual"}
          sub={sub}
          initial={confirming}
          onCancel={() => {
            setConfirming(null);
            setManual(false);
          }}
          onSaved={async () => {
            await onRefresh();
            setConfirming(null);
            setManual(false);
            onNotify("Terms confirmed.");
          }}
        />
      ) : (
        <button
          className="button secondary full"
          onClick={() => setManual(true)}
        >
          Enter terms from the merchant
        </button>
      )}

      <DataToMove sub={sub} onRefresh={onRefresh} />

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

function OfferRow({
  sub,
  offer: o,
  children,
}: {
  sub: Subscription;
  offer: PlanOffer;
  children?: React.ReactNode;
}) {
  const status = offerStatus(o);
  const href = safeHttpUrl(o.sourceUrl);
  const delta = monthly(sub) - monthly(o);
  return (
    <li className="offer">
      <div className="offer-top">
        <div>
          <strong>{o.plan}</strong>
          <small>{KIND_LABEL[o.kind]}</small>
        </div>
        <div className="offer-price">
          <strong>{money(o.price, sub.currency)}</strong>
          <small>/ {per(o.cycle)}</small>
        </div>
      </div>
      <span className={`badge ${status.tone}`}>
        <span />
        {status.label}
      </span>
      {o.confirmedAt && offerIsFresh(o) && delta > 0 && (
        <p className="offer-delta">{money(delta, sub.currency)} / month less</p>
      )}
      {o.quote && (
        <blockquote className="source-excerpt">“{o.quote}”</blockquote>
      )}
      {o.capabilityLoss && (
        <p className="small-note">You’d lose: {o.capabilityLoss}</p>
      )}
      {o.migrationEffort && (
        <p className="small-note">Moving: {o.migrationEffort}</p>
      )}
      <div className="offer-foot">
        {href && (
          <a href={href} target="_blank" rel="noreferrer noopener">
            Source <ExternalLink size={13} />
          </a>
        )}
        <small>Checked {dateLabel(o.checkedAt, true)}</small>
        {children}
      </div>
    </li>
  );
}

function OfferForm({
  sub,
  initial,
  onCancel,
  onSaved,
}: {
  sub: Subscription;
  initial: PlanOffer | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<PlanOffer["kind"]>(
      initial?.kind ?? "downgrade",
    ),
    [plan, setPlan] = useState(initial?.plan ?? ""),
    [price, setPrice] = useState(initial ? String(initial.price) : ""),
    [cycle, setCycle] = useState<PlanOffer["cycle"]>(
      initial?.cycle ?? (kind === "yearly" ? "yearly" : sub.cycle),
    ),
    [capabilityLoss, setCapabilityLoss] = useState(
      initial?.capabilityLoss ?? "",
    ),
    [migrationEffort, setMigrationEffort] = useState(
      initial?.migrationEffort ?? "",
    ),
    [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? ""),
    [quote, setQuote] = useState(initial?.quote ?? ""),
    [attested, setAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const problem = offerProblem(sub, { kind, price: Number(price), cycle });
  // Unchanged extracted terms confirm the original offer; any edit becomes the user's own terms.
  const unchanged =
    initial !== null &&
    initial.kind === kind &&
    initial.plan === plan.trim() &&
    initial.price === Number(price) &&
    initial.cycle === cycle &&
    (initial.capabilityLoss ?? "") === capabilityLoss.trim() &&
    (initial.migrationEffort ?? "") === migrationEffort.trim() &&
    (initial.sourceUrl ?? "") === sourceUrl.trim() &&
    (initial.quote ?? "") === quote.trim();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (sourceUrl && !safeHttpUrl(sourceUrl))
        throw new Error("Use a full http(s) link for the source.");
      await post(`/api/subscriptions/${sub.id}/offers`, {
        kind,
        plan: plan.trim(),
        price: Number(price),
        cycle,
        capabilityLoss: capabilityLoss.trim(),
        ...(migrationEffort.trim()
          ? { migrationEffort: migrationEffort.trim() }
          : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        ...(quote.trim() ? { quote: quote.trim() } : {}),
        ...(unchanged && initial
          ? { offerId: initial.id, reconfirmed: attested }
          : {}),
      });
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="form-grid offer-form" onSubmit={submit}>
      <h3 className="span-two">
        {initial ? "Confirm these terms" : "Terms from the merchant"}
      </h3>
      {initial?.provenance === "research" && (
        <p className="small-note span-two">
          Extracted from a source. Check the merchant’s page and correct
          anything before confirming.
        </p>
      )}
      <label>
        Type
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as PlanOffer["kind"];
            setKind(k);
            if (k === "yearly") setCycle("yearly");
          }}
        >
          <option value="downgrade">Lower plan</option>
          <option value="yearly" disabled={sub.cycle === "yearly"}>
            Annual billing
          </option>
          <option value="migrate">Alternative service</option>
        </select>
      </label>
      <label>
        Plan name *
        <input
          required
          maxLength={100}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        />
      </label>
      <label>
        Price ({sub.currency}) *
        <input
          required
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label>
        Billed
        <select
          value={cycle}
          disabled={kind === "yearly"}
          onChange={(e) => setCycle(e.target.value as PlanOffer["cycle"])}
        >
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </label>
      <label className="span-two">
        What you’d lose *
        <input
          required
          maxLength={300}
          value={capabilityLoss}
          onChange={(e) => setCapabilityLoss(e.target.value)}
          placeholder="e.g. Fewer projects, no team sharing"
        />
      </label>
      {kind === "migrate" && (
        <label className="span-two">
          Effort to move
          <input
            maxLength={300}
            value={migrationEffort}
            onChange={(e) => setMigrationEffort(e.target.value)}
          />
        </label>
      )}
      <label className="span-two">
        Where you saw it <span className="optional">Optional</span>
        <input
          type="url"
          maxLength={500}
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://"
        />
      </label>
      <label className="span-two">
        Exact wording <span className="optional">Optional</span>
        <textarea
          maxLength={500}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Paste the price line from the merchant’s page"
        />
      </label>
      {initial && !unchanged && (
        <p className="small-note span-two">
          Edited terms are saved as terms you entered.
        </p>
      )}
      {problem && Number(price) >= 0 && price !== "" && (
        <p className="notice warning span-two">{problem}</p>
      )}
      <label className="checkbox span-two">
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
        />
        I checked these terms with {sub.name} or the alternative’s own site.
      </label>
      {error && (
        <div className="notice error span-two" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions span-two">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={busy || !attested}>
          {busy && <Loader2 className="spin" size={16} />}Confirm terms
        </button>
      </div>
    </form>
  );
}

function DataToMove({
  sub,
  onRefresh,
}: {
  sub: Subscription;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="data-to-move">
      <label className="checkbox">
        <input
          type="checkbox"
          disabled={busy}
          checked={sub.hasDataToMove === true}
          onChange={async (e) => {
            setBusy(true);
            setError("");
            try {
              await patch(`/api/subscriptions/${sub.id}`, {
                name: sub.name,
                domain: sub.domain,
                plan: sub.plan,
                price: sub.price,
                currency: sub.currency,
                cycle: sub.cycle,
                nextBilling: sub.nextBilling,
                category: sub.category,
                notes: sub.notes,
                hasDataToMove: e.target.checked,
              });
              await onRefresh();
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        />
        I have data in {sub.name} I’d need to move to an alternative
      </label>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
