import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmImports,
  IMPORT_LIMITS,
  inspectImport,
  newSubscription,
  parseDiscovery,
  parseImport,
  parseStatementDate,
  receiptText,
  subscriptionSchema,
} from "../server/imports.js";
import {
  confirmOffer,
  offerFresh,
  parseConfirmation,
  researchSubscription,
  saveResearch,
  validateResearch,
} from "../server/research.js";
import { knownMerchant } from "../shared/merchants.js";
import type { Subscription, Workspace } from "../shared/types.js";

const base = (): Subscription =>
  newSubscription(
    {
      name: "Spotify",
      domain: "spotify.com",
      plan: "Premium",
      price: 20,
      currency: "USD",
      cycle: "monthly",
      nextBilling: "2026-12-01",
      category: "Entertainment",
      notes: "",
    },
    "Manual",
  );
const workspace = (subscriptions: Subscription[] = []): Workspace => ({
  subscriptions,
  actions: [],
  mode: "personal",
  createdAt: new Date().toISOString(),
});
const statement = (text: string, options: Record<string, unknown> = {}) =>
  parseDiscovery({ type: "csv", text, ...options });

test("Chase headers, explicit negative charges, refunds, descriptor normalization, and latest price", async () => {
  const result = await statement(
    "Transaction Date,Post Date,Description,Category,Type,Amount\n09/01/2026,09/02/2026,SPOTIFY USA,Entertainment,Sale,-12\n08/01/2026,08/02/2026,SPOTIFY P123,Entertainment,Sale,-10\n09/02/2026,09/03/2026,SPOTIFY REFUND,Entertainment,Return,10",
    { dateOrder: "MDY", chargeSign: "negative" },
  );
  assert.equal(result.candidates.length, 1);
  const c = result.candidates[0];
  assert.equal(c.name, "Spotify");
  assert.equal(c.domain, "spotify.com");
  assert.equal(c.category, "Entertainment");
  assert.equal(c.price, 12);
  assert.equal(c.confidence, "likely");
  assert.equal(c.selected, true);
  assert.equal(c.charges?.length, 2);
  assert.match(c.alerts?.[0] || "", /price changed/);
  assert.equal(result.report.skippedByReason["Refund or credit"], 1);
});
test("Amex positive charges and Capital One separate debit/credit columns", async () => {
  const amex = await statement(
    "Date,Description,Amount\n08/15/2026,ADOBE *CREATIVE CLOUD,29.99\n09/15/2026,ADOBE *CREATIVE CLOUD,29.99\n09/16/2026,ADOBE CREDIT,-29.99",
  );
  assert.equal(amex.candidates[0].domain, "adobe.com");
  assert.equal(amex.candidates[0].confidence, "likely");
  assert.equal(amex.report.rowsAccepted, 2);
  const cap = await statement(
    "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n2026-08-05,2026-08-06,1234,NETFLIX,Entertainment,15,\n2026-09-05,2026-09-06,1234,NETFLIX.COM,Entertainment,15,\n2026-09-06,2026-09-07,1234,NETFLIX,Entertainment,,15",
  );
  assert.equal(cap.candidates[0].charges?.length, 2);
  assert.equal(cap.report.skippedByReason["Refund or credit"], 1);
});
test("manual mappings, explicit date order, quoted currency amount and Unicode BOM", async () => {
  const text =
    '\uFEFFVendor,Cost,When,Denomination\nFigma,"$1,200.00",03/04/2026,USD';
  const { headers } = inspectImport(text);
  assert.equal(headers[0], "Vendor");
  const options = {
    mapping: {
      merchant: "Vendor",
      amount: "Cost",
      date: "When",
      currency: "Denomination",
    },
  };
  const ambiguous = await statement(text, options);
  assert.equal(ambiguous.candidates.length, 0);
  assert.equal(ambiguous.report.skipped.length, 1);
  const resolved = await statement(text, { ...options, dateOrder: "DMY" });
  assert.equal(resolved.candidates[0].charges?.[0].date, "2026-04-03");
  assert.equal(resolved.candidates[0].price, 1200);
  assert.equal(parseStatementDate("02/29/2025", "MDY"), null);
  assert.equal(parseStatementDate("29/02/2024", "DMY"), "2024-02-29");
  assert.equal(parseStatementDate("2026/09/01"), "2026-09-01");
});
test("refunds, unknown currency, malformed amount/date/columns and duplicate rows are accounted for", async () => {
  const result = await statement(
    "merchant,amount,date,currency\nSpotify,10,2026-08-01,USD\nSpotify,10,2026-08-01,USD\nSpotify,(10),2026-08-02,USD\nUnknown,5,2026-08-01,EUR\nUnknown,5,2026-08-01,\nUnknown,NaN,2026-08-01,USD\nUnknown,2,2026-02-30,USD\nUnknown,0,2026-08-01,USD\nUnknown,2,2026-08-01,USD,extra",
  );
  assert.equal(result.report.rowsRead, 9);
  assert.equal(result.report.rowsAccepted, 1);
  assert.equal(result.report.skipped.length, 8);
  assert.deepEqual(result.report.nonUsdByCurrency, { EUR: 1, UNKNOWN: 1 });
  assert.equal(result.report.skippedByReason["Duplicate charge"], 1);
  assert.equal(result.report.skippedByReason["Refund or credit"], 1);
  const foreign = await statement(
    "merchant,amount,date\nA,€10,2026-08-01\nB,CAD 15,2026-08-01",
  );
  assert.equal(foreign.candidates.length, 0);
  assert.deepEqual(foreign.report.nonUsdByCurrency, { "€": 1, CAD: 1 });
});
test("one-offs remain possible, recurrence tolerates month boundaries, unsupported weekly and quarterly flagged", async () => {
  const one = await statement(
    "name,price,date\nAPPLE.COM/BILL,2.99,2026-08-01",
  );
  assert.equal(one.candidates[0].selected, false);
  assert.equal(one.candidates[0].domain, "");
  assert.equal(one.candidates[0].name, "APPLE.COM/BILL");
  assert.equal(knownMerchant("APPLE.COM/BILL"), undefined);
  assert.equal(knownMerchant("ICLOUD+ STORAGE")?.domain, "icloud.com");
  for (const [dates, expected] of [
    [["2026-01-31", "2026-02-28", "2026-03-31"], "monthly"],
    [["2024-02-29", "2025-02-28"], "yearly"],
    [["2026-08-01", "2026-08-08"], "weekly"],
    [["2026-01-01", "2026-04-01"], "quarterly"],
  ] as const) {
    const result = await statement(
      "merchant,amount,date\n" +
        dates.map((date) => `Example,10,${date}`).join("\n"),
    );
    const c = result.candidates[0];
    if (expected === "weekly" || expected === "quarterly") {
      assert.match(c.reason, new RegExp(expected));
      assert.equal(c.selected, false);
    } else {
      assert.equal(c.cycle, expected);
      assert.equal(c.confidence, "likely");
    }
  }
});
test("candidate and byte limits are explicit, parser compatibility retained", async () => {
  const result = await statement(
    "merchant,amount,date\n" +
      Array.from({ length: 103 }, (_, i) => `Merchant ${i},5,2026-08-01`).join(
        "\n",
      ),
  );
  assert.equal(result.candidates.length, 100);
  assert.equal(result.report.candidatesOmitted, 3);
  assert.equal(result.report.truncated, true);
  await assert.rejects(statement("x".repeat(IMPORT_LIMITS.bytes + 1)), /2 MB/);
  await assert.rejects(
    statement("merchant,amount,date\n" + "X,5,2026-08-01\n".repeat(10001)),
    /10,000/,
  );
  await assert.rejects(
    statement("merchant,merchant,date\nA,B,2026-08-01"),
    /duplicate headers/,
  );
  const old = await parseImport(
    "merchant,amount,date\nExample,10,2026-08-01\nExample,15,2026-09-01",
    "csv",
  );
  assert.equal(old[0].price, 15);
  assert.match(old[0].notes, /2 charges/);
});
test("explicit reviewed merge preserves lifecycle, charges dedup, flags price and post-cancellation charges", async () => {
  const old = base();
  old.status = "cancelled";
  old.endDate = "2026-08-31";
  old.charges = [
    {
      id: "old-charge",
      date: "2026-08-01",
      amount: 10,
      currency: "USD",
      source: "CSV",
    },
  ];
  const d = workspace([old]);
  const parsed = await parseDiscovery(
    {
      type: "csv",
      text: "merchant,amount,date\nSPOTIFY,10,2026-08-01\nSPOTIFY USA,12,2026-09-01",
    },
    d.subscriptions,
  );
  const c = parsed.candidates[0];
  assert.equal(c.matchId, old.id);
  assert.equal(c.selected, false);
  assert.deepEqual(confirmImports(d, [c], "CSV"), {
    count: 0,
    merged: 0,
    skipped: 1,
  });
  assert.deepEqual(confirmImports(d, [c], "CSV", { [c.id]: old.id }), {
    count: 0,
    merged: 1,
    skipped: 0,
  });
  assert.equal(d.subscriptions[0].status, "cancelled");
  assert.equal(d.subscriptions[0].charges?.length, 2);
  assert(
    d.subscriptions[0].alerts?.some((a) => a.includes("after cancellation")),
  );
  assert(d.subscriptions[0].alerts?.some((a) => a.includes("price change")));
  confirmImports(d, [c], "CSV", { [c.id]: old.id });
  assert.equal(d.subscriptions[0].charges?.length, 2);
});
test("confirm is atomic on late invalid match and reimports never silently create duplicates", async () => {
  const rows = await parseImport(
    "merchant,amount,date\nSpotify,12,2026-09-01\nFigma,15,2026-09-01",
    "csv",
  );
  rows.forEach((r) => {
    r.reviewedFields = ["cycle"];
  });
  const d = workspace(),
    before = structuredClone(d);
  assert.throws(
    () => confirmImports(d, rows, "CSV", { [rows[1].id]: "missing" }),
    /no longer exists/,
  );
  assert.deepEqual(d, before);
  assert.equal(confirmImports(d, rows, "CSV").count, 2);
  assert.equal(confirmImports(d, rows, "CSV").skipped, 2);
  assert.equal(
    subscriptionSchema.safeParse({ ...rows[0], nextBilling: "2026-02-31" })
      .success,
    false,
  );
});
test("multipart alternatives, base64 and quoted-printable HTML convert to text, never HTML", async () => {
  const html =
    "<html><body><p>Spotify Premium $12 monthly paid 2026-09-01.</p><script>steal()</script></body></html>";
  const encoded = `MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="b"\r\nSubject: Receipt\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(html).toString("base64")}\r\n--b--`;
  const text = await receiptText(encoded);
  assert.match(text, /Spotify Premium \$12 monthly/);
  assert(!text.includes("<html>"));
  assert(!text.includes("steal()"));
  const qp = await receiptText(
    "Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Figma Pro =2410 monthly.</p>",
  );
  assert.match(qp, /Figma Pro \$10/);
});
const receiptFact = (text: string) => ({
  subscriptions: [
    {
      name: "Spotify",
      plan: "Premium",
      price: 12,
      currency: "USD",
      cycle: "monthly",
      paidAt: "2026-09-01",
      nextBilling: null,
      sourceExcerpt: text,
    },
  ],
});
test("multiple receipts retain excerpts, inferred fields, dedup and matching without paid calls", async () => {
  const first = "Spotify Premium $12 monthly paid 2026-09-01.";
  const result = await parseDiscovery(
    {
      type: "email",
      files: [
        { name: "one.eml", text: first },
        { name: "two.eml", text: first },
      ],
    },
    [base()],
    { extractReceipts: async (text) => receiptFact(text) },
  );
  assert.equal(result.candidates.length, 1);
  const c = result.candidates[0];
  assert.equal(c.charges?.length, 1);
  assert(c.sourceExcerpt?.includes(first));
  assert(c.inferredFields?.includes("nextBilling"));
  assert(c.matchId);
  assert.equal(c.selected, false);
});
test("missing receipt facts are not invented and unsupported model output fails closed", async () => {
  const text = "Spotify receipt.";
  const result = await parseDiscovery({ type: "email", text }, [], {
    extractReceipts: async () => ({
      subscriptions: [
        {
          name: "Spotify",
          plan: null,
          price: null,
          currency: null,
          cycle: null,
          paidAt: null,
          nextBilling: null,
          sourceExcerpt: text,
        },
      ],
    }),
  });
  const c = result.candidates[0];
  assert.equal(c.nextBilling, "");
  assert.equal(c.confidence, "possible");
  assert(c.requiresReview?.includes("price"));
  assert(c.requiresReview?.includes("nextBilling"));
  assert.equal(c.charges, undefined);
  assert.throws(() => confirmImports(workspace(), [c], "Email"));
  await assert.rejects(
    parseDiscovery({ type: "email", text }, [], {
      extractReceipts: async () => receiptFact(text),
    }),
    /unsupported/,
  );
  await assert.rejects(
    parseDiscovery({ type: "email", text }, [], {
      extractReceipts: async () => ({
        subscriptions: [
          {
            ...receiptFact(text).subscriptions[0],
            sourceExcerpt: "invented text",
          },
        ],
      }),
    }),
    /exact supporting excerpt/,
  );
  await assert.rejects(
    parseDiscovery({
      type: "email",
      files: Array.from({ length: 21 }, () => ({ name: "x", text })),
    }),
    /1–20/,
  );
  await assert.rejects(receiptText("a".repeat(500001)), /500 KB/);
});
const source = {
  title: "Official pricing",
  url: "https://spotify.com/pricing",
  text: "Basic costs $10 per month. Annual costs $100 per year.",
};
const extracted = () => ({
  summary: "Basic loses offline playback. Confirm the current price.",
  plans: [
    {
      kind: "downgrade",
      plan: "Basic",
      price: 10,
      cycle: "monthly",
      sourceUrl: source.url,
      quote: "Basic costs $10 per month.",
      capabilityLoss: "Offline playback",
    },
  ],
});
test("research is saved with unconfirmed structured offers and confirmation preserves provenance", async () => {
  const sub = base();
  const result = await researchSubscription(sub, {
    search: async () => [source],
    extract: async () => extracted(),
  });
  saveResearch(sub, result);
  const restored = JSON.parse(JSON.stringify(sub)) as Subscription;
  assert.deepEqual(restored.research, result);
  assert.equal(restored.offers?.[0].confirmedAt, undefined);
  const confirmed = confirmOffer(restored, {
    offerId: restored.offers![0].id,
    provenance: "user",
  });
  assert.throws(
    () => confirmOffer(restored, { offerId: restored.offers![0].id, price: 1 }),
    /terms changed/,
  );
  assert.equal(confirmed.price, 10);
  assert.equal(confirmed.provenance, "research");
  assert(confirmed.confirmedAt);
  assert(offerFresh(confirmed));
});
test("research rejects fake quotes, amount, URL, cycle and malformed output without partial mutation", async () => {
  const sub = base(),
    before = structuredClone(sub);
  for (const change of [
    { quote: "Invented $10 per month." },
    { price: 9 },
    { sourceUrl: "https://other.example/pricing" },
    { cycle: "yearly" },
    { plan: "Invented plan" },
  ]) {
    const output = extracted();
    Object.assign(output.plans[0], change);
    assert.throws(() => validateResearch(sub, output, [source]));
    assert.deepEqual(sub, before);
  }
  await assert.rejects(
    researchSubscription(sub, {
      search: async () => {
        throw new Error("Search unavailable");
      },
      extract: async () => extracted(),
    }),
    /Search unavailable/,
  );
  assert.deepEqual(sub, before);
  await assert.rejects(
    researchSubscription(sub, {
      search: async () => [source],
      extract: async () => ({ summary: "x", plans: [{ price: "10" }] }),
    }),
  );
  assert.deepEqual(sub, before);
  const annualDisplay = {
    ...source,
    text: "Basic costs $10 per month, billed annually.",
  };
  const output = extracted();
  output.plans[0].quote = annualDisplay.text;
  assert.throws(
    () => validateResearch(sub, output, [annualDisplay]),
    /billing cycle/,
  );
});
test("offer confirmation rejects stale, non-cheaper, invalid annual, unsafe provenance links; user terms persist", () => {
  const sub = base();
  saveResearch(sub, validateResearch(sub, extracted(), [source]));
  sub.offers![0].checkedAt = new Date(Date.now() - 31 * 86400000).toISOString();
  assert.throws(
    () => confirmOffer(sub, { offerId: sub.offers![0].id }),
    /stale/,
  );
  const terms = {
    kind: "downgrade",
    plan: "Basic",
    price: 10,
    cycle: "monthly",
    capabilityLoss: "Offline playback",
    quote: "Terms copied from merchant account.",
  };
  const offer = confirmOffer(sub, terms);
  assert.equal(offer.provenance, "user");
  assert(offer.confirmedAt);
  assert.throws(() => confirmOffer(sub, { ...terms, price: 25 }), /less/);
  assert.throws(() =>
    confirmOffer(sub, { ...terms, sourceUrl: "javascript:alert(1)" }),
  );
  assert.throws(
    () =>
      confirmOffer(
        { ...sub, cycle: "yearly" },
        { ...terms, kind: "yearly", cycle: "yearly", price: 5 },
      ),
    /monthly subscription/,
  );
  const annual = confirmOffer(sub, {
    ...terms,
    kind: "yearly",
    cycle: "yearly",
    price: 100,
  });
  assert.equal(annual.price, 100);
});
test("confirmation extraction is read-only, grounded and explicitly editable", async () => {
  const text = "Your subscription access ends October 31, 2026.";
  const result = await parseConfirmation(text, async () => ({
    endDate: "2026-10-31",
    summary: "Access end date in the confirmation.",
    sourceQuote: text,
  }));
  assert.equal(result.endDate, "2026-10-31");
  assert.match(result.summary, /Unverified date suggestion/);
  await assert.rejects(
    parseConfirmation(text, async () => ({
      endDate: "2026-11-30",
      summary: "x",
      sourceQuote: text,
    })),
    /supporting source/,
  );
  await assert.rejects(
    parseConfirmation("Ends 03/04/2026.", async () => ({
      endDate: "2026-03-04",
      summary: "x",
      sourceQuote: "Ends 03/04/2026.",
    })),
    /unambiguous/,
  );
});

test("personal import requires an explicit workspace switch and never strips demo samples", async () => {
  const d = workspace([base()]);
  d.mode = "demo";
  const before = structuredClone(d);
  const rows = await parseImport(
    "merchant,amount,date\nFigma,15,2026-09-01",
    "csv",
  );
  assert.throws(
    () => confirmImports(d, rows, "CSV"),
    /Start a personal workspace/,
  );
  assert.deepEqual(d, before);
});

test("unknown receipt currency needs explicit review, not a silent USD default", async () => {
  const text = "Spotify Premium receipt, paid 2026-09-01.";
  const result = await parseDiscovery({ type: "email", text }, [], {
    extractReceipts: async () => ({
      subscriptions: [
        {
          name: "Spotify",
          plan: "Premium",
          price: null,
          currency: null,
          cycle: null,
          paidAt: "2026-09-01",
          nextBilling: null,
          sourceExcerpt: text,
        },
      ],
    }),
  });
  assert.equal(result.report.nonUsdByCurrency.UNKNOWN, 1);
  const candidate = {
    ...result.candidates[0],
    price: 12,
    nextBilling: "2026-10-01",
  };
  assert.throws(
    () => confirmImports(workspace(), [candidate], "Email"),
    /Explicitly confirm USD/,
  );
  assert.equal(
    confirmImports(
      workspace(),
      [{ ...candidate, reviewedFields: ["currency", "cycle"] }],
      "Email",
    ).count,
    1,
  );
});
test("research cannot borrow a cheaper amount from another billing cadence", () => {
  const output = extracted();
  output.plans[0].quote = source.text;
  output.plans[0].cycle = "yearly";
  assert.throws(
    () => validateResearch(base(), output, [source]),
    /billing cycle/,
  );
  output.plans[0].cycle = "monthly";
  output.plans[0].plan = "Annual";
  output.plans[0].quote = "Basic costs $10 per month.";
  assert.throws(() => validateResearch(base(), output, [source]), /plan name/);
});

test("long merged receipt excerpts survive a complete backup round trip", async () => {
  const { exportBackup, importBackup } = await import("../shared/backup.js");
  const first =
    "Spotify Premium $12 monthly paid 2026-09-01. " + "A".repeat(1510);
  const second =
    "Spotify Premium $12 monthly paid 2026-09-01. " + "B".repeat(1510);
  const parsed = await parseDiscovery(
    {
      type: "email",
      files: [
        { name: "a.eml", text: first },
        { name: "b.eml", text: second },
      ],
    },
    [],
    { extractReceipts: async (text) => receiptFact(text) },
  );
  const d = workspace();
  confirmImports(d, parsed.candidates, "Email");
  const summary = d.subscriptions[0].evidence[0].summary;
  assert(summary.length > 3000);
  assert.equal(
    importBackup(exportBackup(d)).subscriptions[0].evidence[0].summary,
    summary,
  );
});

test("weekly and quarterly charges need an explicit supported cycle", async () => {
  for (const date of ["2026-09-08", "2026-12-01"]) {
    const parsed = await parseDiscovery({
      type: "csv",
      text: `merchant,amount,date\nSpotify,12,2026-09-01\nSpotify,12,${date}`,
    });
    const c = parsed.candidates[0];
    assert.equal(c.selected, false);
    assert.match(c.reason!, /Unsupported/);
    assert.throws(
      () => confirmImports(workspace(), [c], "CSV"),
      /Choose monthly or yearly/,
    );
    c.reviewedFields = ["cycle"];
    assert.equal(confirmImports(workspace(), [c], "CSV").count, 1);
  }
});

test("explicit reconfirmation refreshes stale terms with user provenance", () => {
  const sub = base();
  saveResearch(sub, validateResearch(sub, extracted(), [source]));
  const old = sub.offers![0];
  old.checkedAt = new Date(Date.now() - 31 * 86400000).toISOString();
  assert.throws(() => confirmOffer(sub, { offerId: old.id }), /stale/);
  const confirmed = confirmOffer(sub, { offerId: old.id, reconfirmed: true });
  assert(offerFresh(confirmed));
  assert.equal(confirmed.provenance, "user");
  assert.equal(confirmed.price, old.price);
  assert.equal(confirmed.checkedAt, confirmed.confirmedAt);
});
