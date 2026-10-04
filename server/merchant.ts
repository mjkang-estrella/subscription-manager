import { Router } from "express";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  Action,
  PlanOffer,
  Subscription,
  Terms,
} from "../shared/types.js";
import { today, offerIsFresh, monthly } from "../shared/domain.js";
import { termsOf } from "../shared/lifecycle.js";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let ready: Promise<unknown> | undefined;
const local = new Map<string, Row>();
type Document = { id: string; title: string; body: string };
export type Merchant = {
  id: string;
  workspace: string;
  name: string;
  variant: "standard" | "alternate";
  initial: Terms;
  current: Terms;
  offers: PlanOffer[];
  effectiveDate: string;
  documents: Document[];
  exported?: Document[];
  imported?: Document[];
  stage:
    | "home"
    | "settings"
    | "options"
    | "retention"
    | "export"
    | "import"
    | "confirm"
    | "done";
  selected?: { kind: Action["kind"]; terms: Terms; offerId?: string };
  scheduled?: { kind: Action["kind"]; terms: Terms; effectiveDate: string };
  receipt?: string;
  completedAt?: string;
};
type Row = { data: Merchant; hash: string; expires: number };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function init() {
  if (sql)
    await (ready ??= sql`CREATE TABLE IF NOT EXISTS folio_merchants (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, token_hash TEXT NOT NULL, expires BIGINT NOT NULL, data JSONB NOT NULL)`);
  else if (process.env.VERCEL)
    throw new Error("Merchant database is required.");
}
export async function createMerchant(
  workspace: string,
  sub: Subscription,
  action: Action,
) {
  await init();
  const id = crypto.randomUUID(),
    token = randomBytes(32).toString("hex");
  const data: Merchant = {
    id,
    workspace,
    name: sub.name,
    variant: action.fixtureVariant || "standard",
    initial: termsOf(sub),
    current: termsOf(sub),
    offers: structuredClone(
      (sub.offers || []).filter(
        (o, i, all) =>
          offerIsFresh(o) &&
          monthly(o) < monthly(sub) &&
          all.findIndex(
            (other) =>
              offerIsFresh(other) &&
              other.kind === o.kind &&
              other.plan === o.plan &&
              other.price === o.price &&
              other.cycle === o.cycle,
          ) === i,
      ),
    ),
    effectiveDate: action.effectiveDate,
    documents: sub.hasDataToMove
      ? [
          {
            id: "notes",
            title: "Project notes",
            body: "Keep the complete synthetic project notes.",
          },
          {
            id: "reading",
            title: "Reading list",
            body: "Books, articles, and a unicode check: café 🌿.",
          },
          {
            id: "plans",
            title: "Plans",
            body: "Next month\nTwo lines remain intact.",
          },
        ]
      : [],
    stage: "home",
  };
  const row = { data, hash: hash(token), expires: Date.now() + 600000 };
  if (sql)
    await sql`INSERT INTO folio_merchants(id,workspace,token_hash,expires,data) VALUES (${id},${workspace},${row.hash},${row.expires},${JSON.stringify(data)}::jsonb)`;
  else local.set(id, structuredClone(row));
  return { id, token };
}
async function row(id: string): Promise<Row | undefined> {
  await init();
  if (sql) {
    const rows =
      await sql`SELECT data,token_hash,expires FROM folio_merchants WHERE id=${id}`;
    return rows[0]
      ? {
          data: rows[0].data as Merchant,
          hash: rows[0].token_hash as string,
          expires: Number(rows[0].expires),
        }
      : undefined;
  }
  const value = local.get(id);
  return value ? structuredClone(value) : undefined;
}
export async function readMerchant(workspace: string, id: string) {
  const value = await row(id);
  if (!value || value.data.workspace !== workspace)
    throw Object.assign(new Error("Merchant run not found."), { status: 404 });
  return value.data;
}
async function authorize(id: string, token: string) {
  const value = await row(id);
  if (
    !value ||
    value.expires < Date.now() ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !timingSafeEqual(
      Buffer.from(value.hash, "hex"),
      Buffer.from(hash(token), "hex"),
    )
  )
    throw Object.assign(new Error("Merchant access expired or unavailable."), {
      status: 403,
    });
  return value;
}
export async function revokeMerchant(workspace: string, id: string) {
  await init();
  if (sql)
    await sql`UPDATE folio_merchants SET expires=0 WHERE id=${id} AND workspace=${workspace}`;
  else {
    const r = local.get(id);
    if (r?.data.workspace === workspace) r.expires = 0;
  }
}
export async function cleanupWorkspace(workspace: string) {
  await init();
  if (sql) await sql`DELETE FROM folio_merchants WHERE workspace=${workspace}`;
  else
    for (const [id, r] of local)
      if (r.data.workspace === workspace) local.delete(id);
}
// PostgreSQL jsonb can reorder object keys; document content and sequence are what matter.
const same = (a: Document[], b: Document[] | undefined) =>
  !!b &&
  a.length === b.length &&
  a.every(
    (doc, i) =>
      doc.id === b[i].id && doc.title === b[i].title && doc.body === b[i].body,
  );
const termsMatch = (a: Terms, b: Terms) =>
  a.plan === b.plan &&
  a.price === b.price &&
  a.cycle === b.cycle &&
  a.status === b.status &&
  a.nextBilling === b.nextBilling &&
  a.endDate === b.endDate;
export function verifyMerchant(
  m: Merchant,
  action: Action,
): NonNullable<Action["verification"]> {
  if (!m.receipt || m.stage !== "done" || !m.selected || !m.completedAt)
    throw new Error("The merchant flow has not completed.");
  const target = m.selected.terms;
  const scheduled = action.effectiveDate > m.completedAt.slice(0, 10);
  if (
    m.selected.kind !== action.kind ||
    target.plan !== action.toPlan ||
    target.price !== action.toPrice ||
    target.cycle !== action.toCycle ||
    m.effectiveDate !== action.effectiveDate ||
    m.initial.plan !== action.fromPlan ||
    m.initial.price !== action.fromPrice ||
    m.initial.cycle !== action.fromCycle
  )
    throw new Error("Merchant terms do not match the approved change.");
  const expectedStatus = action.kind === "cancel" ? "cancelled" : "active";
  if (
    target.status !== expectedStatus ||
    target.nextBilling !== action.effectiveDate ||
    (action.kind === "cancel" && target.endDate !== action.effectiveDate)
  )
    throw new Error("Merchant effective terms do not match approval.");
  if (scheduled) {
    if (
      !m.scheduled ||
      m.scheduled.effectiveDate !== action.effectiveDate ||
      m.scheduled.kind !== action.kind ||
      !termsMatch(m.scheduled.terms, target) ||
      !termsMatch(m.current, m.initial)
    )
      throw new Error("Merchant did not schedule the approved change.");
  } else if (m.scheduled || !termsMatch(m.current, target))
    throw new Error("Merchant account did not reach the approved state.");
  if (
    action.kind === "migrate" &&
    (!m.documents.length ||
      !same(m.documents, m.exported) ||
      !same(m.exported!, m.imported))
  )
    throw new Error("Exported and imported documents do not match.");
  return {
    plan: target.plan,
    price: target.price,
    cycle: target.cycle,
    status:
      scheduled && action.kind === "cancel" ? "cancel_pending" : expectedStatus,
    effectiveDate: m.effectiveDate,
    scheduled,
    ...(action.kind === "migrate"
      ? { exportedItems: m.exported!.length, importedItems: m.imported!.length }
      : {}),
  };
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const price = (t: Pick<Terms, "price" | "cycle">) =>
  `$${t.price.toFixed(2)} / ${t.cycle === "yearly" ? "year" : "month"}`;
export function merchantPage(m: Merchant, token: string) {
  const alt = m.variant === "alternate";
  const button = (op: string, label: string) =>
    `<button data-op="${escape(op)}">${escape(label)}</button>`;
  let content = "";
  if (m.stage === "home")
    content = button("manage", alt ? "Account menu" : "Manage subscription");
  if (m.stage === "settings")
    content = `<h2>Account menu</h2>${button("billing", "Billing settings")}${button("home", "Back to overview")}`;
  if (m.stage === "options")
    content = `<h2>${alt ? "Membership choices" : "Subscription options"}</h2>${button("cancel", alt ? "End membership" : "Cancel subscription")}${m.offers.map((o) => button(`select:${o.id}`, `${o.kind === "migrate" ? (alt ? "Transfer to " : "Move to ") : o.kind === "yearly" ? (alt ? "Annual billing: " : "Switch billing to ") : alt ? "Lower plan: " : "Choose lower plan "}${o.plan} · ${price(o)}`)).join("")}${button("home", alt ? "Leave membership unchanged" : "Keep current plan")}`;
  if (m.stage === "retention")
    content = `<h2>Before you go</h2><p>Retain your current membership or continue ending access on ${escape(m.effectiveDate)}.</p>${button("home", alt ? "Stay and save later" : "Keep my benefits")}${button("continue-cancel", alt ? "Proceed with ending membership" : "Continue cancellation")}`;
  if (m.stage === "export")
    content = `<h2>Transfer your documents</h2><p>${m.documents.length} synthetic documents. Preserve all content before moving.</p>${button("export", alt ? "Download workspace archive" : "Export documents")}`;
  if (m.stage === "import")
    content = `<h2>Archive ready</h2><p>${m.exported?.length || 0} documents exported.</p>${button("import", alt ? "Restore archive in destination" : "Import into replacement")}`;
  if (m.stage === "confirm")
    content = `<h2>Confirm your change</h2><p id="target">${escape(m.selected!.terms.plan)} · ${price(m.selected!.terms)}</p><p>Effective date: ${escape(m.effectiveDate)}</p><p>${m.selected!.kind === "cancel" ? "No refund is assumed. Access ends on the date above." : "The new price and billing cycle take effect on the date above."}</p>${button("confirm", alt ? "Submit membership request" : "Confirm change")}${button("home", alt ? "Never mind, keep membership" : "Keep current plan")}`;
  if (m.stage === "done")
    content = `<h2>Change confirmed</h2><p id="receipt">${escape(m.receipt!)}</p><p>${escape(m.selected!.terms.plan)} · ${price(m.selected!.terms)}</p><p>Effective date: ${escape(m.effectiveDate)} · ${m.scheduled ? "Scheduled" : "Applied"}</p>${m.imported ? `<p>${m.imported.length} documents imported and verified.</p>` : ""}`;
  const endpoint = `/api/merchant/${m.id}/operate?access=${token}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(m.name)} · controlled merchant</title><style>body{font:16px system-ui;color:#173e2d;background:#f3f5ef;margin:0}header{background:#193f30;color:white;padding:24px}main{max-width:700px;margin:32px auto;padding:32px;background:white;border:1px solid #d9e2d4;border-radius:12px}button{display:block;background:#246248;color:white;border:0;border-radius:7px;padding:14px 18px;margin:12px 0;font:inherit;cursor:pointer}button:disabled{opacity:.6}p{line-height:1.5}.notice{font-size:12px;letter-spacing:.08em}#error{color:#8f3020}</style></head><body><header>${escape(m.name)} · controlled test account</header><main><p class="notice">FOLIO MERCHANT SANDBOX · NO REAL BILLING</p><h1>Account & billing</h1><p>${escape(m.current.plan)} · ${price(m.current)}</p><section>${content}</section><p id="error" role="alert"></p></main><script>
const endpoint=${JSON.stringify(endpoint)}, archiveKey=${JSON.stringify(`folio-archive-${m.id}`)};
for(const button of document.querySelectorAll('button[data-op]')) button.onclick=async()=>{button.disabled=true;try{const operation=button.dataset.op;const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,...(operation==='import'?{documents:JSON.parse(sessionStorage.getItem(archiveKey)||'null')}:{})})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Merchant request failed');if(body.documents){sessionStorage.setItem(archiveKey,JSON.stringify(body.documents));const url=URL.createObjectURL(new Blob([JSON.stringify(body.documents)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='workspace-archive.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}location.reload();}catch(e){document.getElementById('error').textContent=e.message;button.disabled=false;}};
</script></body></html>`;
}
// This mutator is deliberately private: only the hosted merchant handler can submit changes.
function operate(m: Merchant, operation: string, documents?: Document[]) {
  if (m.stage === "done")
    throw new Error("This merchant flow has already completed.");
  if (operation === "home") {
    m.stage = "home";
    delete m.selected;
    return;
  }
  if (operation === "manage" && m.stage === "home") {
    m.stage = m.variant === "alternate" ? "settings" : "options";
    return;
  }
  if (operation === "billing" && m.stage === "settings") {
    m.stage = "options";
    return;
  }
  if (operation === "cancel" && m.stage === "options") {
    m.selected = {
      kind: "cancel",
      terms: {
        plan: "Cancelled",
        price: 0,
        cycle: m.initial.cycle,
        status: "cancelled",
        nextBilling: m.effectiveDate,
        endDate: m.effectiveDate,
      },
    };
    m.stage = "retention";
    return;
  }
  if (operation.startsWith("select:") && m.stage === "options") {
    const offer = m.offers.find((o) => o.id === operation.slice(7));
    if (!offer || (offer.kind === "migrate" && !m.documents.length))
      throw new Error("Merchant offer is unavailable.");
    m.selected = {
      kind: offer.kind,
      offerId: offer.id,
      terms: {
        plan: offer.plan,
        price: offer.price,
        cycle: offer.cycle,
        status: "active",
        nextBilling: m.effectiveDate,
      },
    };
    m.stage = offer.kind === "migrate" ? "export" : "confirm";
    return;
  }
  if (operation === "continue-cancel" && m.stage === "retention") {
    m.stage = "confirm";
    return;
  }
  if (operation === "export" && m.stage === "export") {
    m.exported = structuredClone(m.documents);
    m.stage = "import";
    return m.exported;
  }
  if (operation === "import" && m.stage === "import") {
    if (!m.exported?.length || !same(m.exported, documents))
      throw new Error(
        "The imported archive does not match the exported content.",
      );
    m.imported = structuredClone(documents);
    m.stage = "confirm";
    return;
  }
  if (operation === "confirm" && m.stage === "confirm" && m.selected) {
    if (
      m.selected.kind === "migrate" &&
      (!m.imported?.length || !same(m.documents, m.imported))
    )
      throw new Error("Transfer must finish before confirming.");
    if (m.effectiveDate > today())
      m.scheduled = {
        kind: m.selected.kind,
        terms: structuredClone(m.selected.terms),
        effectiveDate: m.effectiveDate,
      };
    else m.current = structuredClone(m.selected.terms);
    m.receipt = `FOLIO-TEST-${crypto.randomUUID()}`;
    m.completedAt = new Date().toISOString();
    m.stage = "done";
    return;
  }
  throw new Error(
    "This control is not available at the current merchant step.",
  );
}
export const merchantRouter = Router();
merchantRouter.get("/api/merchant/:id", async (req, res) => {
  const token = String(req.query.access || "");
  const r = await authorize(String(req.params.id), token);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(merchantPage(r.data, token));
});
merchantRouter.post("/api/merchant/:id/operate", async (req, res) => {
  const input = z
    .object({
      operation: z.string().max(150),
      documents: z
        .array(
          z.object({ id: z.string(), title: z.string(), body: z.string() }),
        )
        .max(100)
        .nullable()
        .optional(),
    })
    .parse(req.body);
  const id = String(req.params.id),
    token = String(req.query.access || "");
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await authorize(id, token),
      before = JSON.stringify(r.data);
    const documents = operate(
      r.data,
      input.operation,
      input.documents || undefined,
    );
    if (sql) {
      const changed =
        await sql`UPDATE folio_merchants SET data=${JSON.stringify(r.data)}::jsonb WHERE id=${id} AND data=${before}::jsonb AND expires>${Date.now()} RETURNING id`;
      if (!changed.length) continue;
    } else {
      const current = local.get(id);
      if (!current || JSON.stringify(current.data) !== before) continue;
      local.set(id, r);
    }
    return res.json({ ok: true, ...(documents ? { documents } : {}) });
  }
  throw new Error("Merchant is busy. Try again.");
});
