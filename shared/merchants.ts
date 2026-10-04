import type { Category } from "./types.js";

/** Client-safe registry. Statement patterns identify the service, not a payment processor. */
export const merchants: {
  name: string;
  domain: string;
  domains: string[];
  category: Category;
  logo: string;
  statement: RegExp;
}[] = [
  {
    name: "Spotify",
    domain: "spotify.com",
    domains: ["spotify.com"],
    category: "Entertainment",
    logo: "/logos/spotify.png",
    statement: /^(?:PAYPAL\s*\*\s*)?SPOTIFY(?:\b|\*)/i,
  },
  {
    name: "Netflix",
    domain: "netflix.com",
    domains: ["netflix.com"],
    category: "Entertainment",
    logo: "/logos/netflix.png",
    statement: /^NETFLIX(?:\b|\*)/i,
  },
  {
    name: "Notion",
    domain: "notion.so",
    domains: ["notion.so", "notion.com"],
    category: "Productivity",
    logo: "/logos/notion.png",
    statement: /^NOTION(?:\s+LABS|\.SO|\.COM|\s*\*|$)/i,
  },
  {
    name: "Adobe",
    domain: "adobe.com",
    domains: ["adobe.com"],
    category: "Design",
    logo: "/logos/adobe.svg",
    statement: /^(?:ADOBE(?:\b|\*)|CREATIVE CLOUD$)/i,
  },
  {
    name: "Figma",
    domain: "figma.com",
    domains: ["figma.com"],
    category: "Design",
    logo: "/logos/figma.svg",
    statement: /^FIGMA(?:\b|\*)/i,
  },
  {
    name: "GitHub",
    domain: "github.com",
    domains: ["github.com"],
    category: "Developer tools",
    logo: "/logos/github.png",
    statement: /^GITHUB(?:\b|\*)/i,
  },
  {
    name: "YouTube Premium",
    domain: "youtube.com",
    domains: ["youtube.com", "youtu.be"],
    category: "Entertainment",
    logo: "/logos/youtube.png",
    statement: /^(?:GOOGLE\s*\*\s*)?YOUTUBE(?:\s*PREMIUM|\s*\*|$)/i,
  },
  // APPLE.COM/BILL can describe many products. It intentionally has no match.
  {
    name: "iCloud+",
    domain: "icloud.com",
    domains: ["icloud.com"],
    category: "Storage",
    logo: "/logos/icloud.png",
    statement: /^(?:APPLE\s*\*\s*)?ICLOUD(?:\+|\b)/i,
  },
];
export function safeDomain(value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      !/^[a-z0-9.-]+$/i.test(url.hostname)
    )
      return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function knownMerchant(description: string, domain = "") {
  const host = safeDomain(domain);
  return merchants.find(
    (m) =>
      m.statement.test(description.trim()) ||
      (host && m.domains.some((d) => host === d || host.endsWith(`.${d}`))),
  );
}
export function merchantKey(name: string, domain = ""): string {
  const known = knownMerchant(name, domain);
  return known ? known.domain : name.trim().toLowerCase().replace(/\s+/g, " ");
}
