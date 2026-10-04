import type { Subscription } from "../shared/types";
import { knownMerchant } from "../shared/merchants";
import companyLogos from "./companyLogos.json";

const companyDomains = companyLogos
  .flatMap((brand) =>
    brand.domains.map((domain) => ({ file: brand.file, domain })),
  )
  .sort((a, b) => b.domain.length - a.domain.length);

const brands = [
  { file: "spotify.png", domains: ["spotify.com"], names: ["spotify"] },
  {
    file: "notion.png",
    domains: ["notion.so", "notion.com"],
    names: ["notion"],
  },
  {
    file: "adobe.svg",
    domains: ["adobe.com"],
    names: ["adobe", "adobe creative cloud", "creative cloud"],
  },
  { file: "netflix.png", domains: ["netflix.com"], names: ["netflix"] },
  { file: "figma.svg", domains: ["figma.com"], names: ["figma"] },
  { file: "github.png", domains: ["github.com"], names: ["github"] },
  {
    file: "youtube.png",
    domains: ["youtube.com", "youtu.be"],
    names: ["youtube", "youtube premium"],
  },
];

export function serviceLogo(
  sub: Pick<Subscription, "name" | "domain">,
): string | undefined {
  let host = "";
  if (sub.domain) {
    try {
      host = new URL(
        /^https?:\/\//i.test(sub.domain) ? sub.domain : `https://${sub.domain}`,
      ).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }
  const name = sub.name.trim().toLowerCase();
  const matches = (domain: string) =>
    host === domain || host.endsWith(`.${domain}`);
  if (
    matches("icloud.com") ||
    (matches("apple.com") && name.includes("icloud")) ||
    (!host && ["icloud", "icloud+"].includes(name))
  ) {
    return "/logos/icloud.png";
  }
  // Receipt product names distinguish apps sharing a billing provider's domain.
  const product = companyLogos.find((brand) => brand.names.includes(name));
  if (product) return `/logos/${product.file}`;
  const brand = brands.find((brand) =>
    host ? brand.domains.some(matches) : brand.names.includes(name),
  );
  if (brand) return `/logos/${brand.file}`;
  const company = companyDomains.find((brand) => matches(brand.domain));
  if (company) return `/logos/${company.file}`;
  // Statement descriptors such as "SPOTIFY USA" with no domain yet.
  return host ? undefined : knownMerchant(sub.name)?.logo;
}
