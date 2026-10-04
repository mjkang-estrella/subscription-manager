import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import type { Subscription } from "../shared/types";
import { today } from "../shared/domain";
import { api } from "./api";
import { Modal } from "./components";
import { CATEGORIES, errorText } from "./format";

export function SubscriptionForm({
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
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(
        initial ? `/api/subscriptions/${initial.id}` : "/api/subscriptions",
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify({
            ...body,
            price: Number(body.price),
            currency: "USD",
            ...(initial?.hasDataToMove !== undefined
              ? { hasDataToMove: initial.hasDataToMove }
              : {}),
          }),
        },
      );
      await onSave();
    } catch (err) {
      setError(errorText(err));
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
          Website <span className="optional">Optional, used for logo and links</span>
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
          {initial ? "Billing anchor date *" : "Next payment *"}
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
            {CATEGORIES.map((c) => (
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
        {initial && (
          <p className="small-note span-two">
            To record a cancellation or plan change, use the Change tab so
            Folio keeps the before and after terms.
          </p>
        )}
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
