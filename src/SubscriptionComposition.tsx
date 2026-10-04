import { useState } from "react";
import type { Subscription } from "../shared/types";
import { money, monthly } from "../shared/domain";

export function SubscriptionComposition({
  subscriptions,
  onSelect,
}: {
  subscriptions: Subscription[];
  onSelect: (subscription: Subscription) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const highlighted = hovered ?? focused;
  const entries = subscriptions
    .map((subscription) => ({ subscription, amount: monthly(subscription) }))
    .sort((a, b) => b.amount - a.amount);
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  let offset = 0;
  const slices = entries.map((entry, index) => {
    const share = total > 0 ? entry.amount / total : 0;
    const slice = {
      ...entry,
      share,
      offset,
      color: `var(--composition-${(index % 8) + 1})`,
    };
    offset += share * 100;
    return slice;
  });
  const percent = (share: number) =>
    share > 0 && share < 0.001
      ? "<0.1%"
      : new Intl.NumberFormat("en-US", {
          style: "percent",
          maximumFractionDigits: 1,
        }).format(share);

  return (
    <div className="composition">
      <div className="composition-visual">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle className="composition-track" cx="120" cy="120" r="94" />
          {slices
            .filter((slice) => slice.share > 0)
            .map((slice) => (
              <circle
                key={slice.subscription.id}
                cx="120"
                cy="120"
                r="94"
                pathLength="100"
                fill="none"
                stroke={slice.color}
                strokeWidth="28"
                strokeDasharray={`${slice.share * 100} ${100 - slice.share * 100}`}
                strokeDashoffset={-slice.offset}
                transform="rotate(-90 120 120)"
                opacity={
                  highlighted && highlighted !== slice.subscription.id
                    ? 0.25
                    : 1
                }
              />
            ))}
        </svg>
        <div className="composition-total">
          <strong>{money(total)}</strong>
          <span>per month</span>
          <small>{subscriptions.length} active subscriptions</small>
        </div>
      </div>
      {entries.length ? (
        <ul
          className="composition-legend"
          aria-label="Subscriptions by share of monthly cost"
        >
          {slices.map(({ subscription, amount, share, color }) => (
            <li key={subscription.id}>
              <button
                type="button"
                onClick={() => onSelect(subscription)}
                onMouseEnter={() => setHovered(subscription.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocused(subscription.id)}
                onBlur={() => setFocused(null)}
                aria-label={`${subscription.name}: ${money(amount)} per month, ${percent(share)} of total. View subscription.`}
              >
                <span
                  className="composition-swatch"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="composition-name">{subscription.name}</span>
                <span className="composition-share">{percent(share)}</span>
                <strong>{money(amount)}</strong>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="composition-empty">
          Add a subscription to see where your monthly total goes.
        </p>
      )}
    </div>
  );
}
