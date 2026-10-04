import { createHash } from "node:crypto";
import type { Workspace } from "../shared/types.js";
import { billingEntries, today, money } from "../shared/domain.js";
const escapeText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
// RFC 5545 line folding is measured in UTF-8 octets, not JS string length.
function fold(line: string) {
  const lines: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > 73) {
      lines.push(current);
      current = " " + char;
    } else current += char;
  }
  lines.push(current);
  return lines.join("\r\n");
}
export function calendarFeed(workspace: Workspace, asOf = today()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Folio//Renewals//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Folio renewals",
  ];
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const start = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  for (const s of workspace.subscriptions) {
    for (let offset = 0; offset < 13; offset++) {
      const month = new Date(start);
      month.setUTCMonth(month.getUTCMonth() + offset);
      for (const { sub: effective, date } of billingEntries(
        s,
        month.toISOString().slice(0, 7),
      )) {
        if (date < asOf) continue;
        const end = new Date(date + "T00:00:00Z");
        end.setUTCDate(end.getUTCDate() + 1);
        lines.push(
          "BEGIN:VEVENT",
          `UID:${createHash("sha256").update(s.id).digest("hex").slice(0, 32)}-${date}@folio`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`,
          `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll("-", "")}`,
          `SUMMARY:${escapeText(`${s.name} · ${money(effective.price)}`)}`,
          "BEGIN:VALARM",
          "TRIGGER:-P1D",
          "ACTION:DISPLAY",
          "DESCRIPTION:Subscription renewal",
          "END:VALARM",
          "END:VEVENT",
        );
      }
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
