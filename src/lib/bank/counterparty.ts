// Pulls the other party's name and the payment reference out of statement text.
// Used for display and for grouping payments to the same payee, never for amounts.
import type { ParsedTxn } from "./types";

const UOB_TYPES = ["DuitNow/Instant Trf", "DuitNow QR", "FPX Debit", "Fund Trf EB", "Funds Transfer", "IBG CR", "IBG DR", "Service Charge"];

// Bank codes UOB prints in front of the other party's name ("GEB" on payments the company sends).
// UOB repeats the name: a shortened copy, then the full name ending in "||".
const BANK_CODES = ["GEB", "OCBC", "PBB", "MBB", "CIMB", "RHB", "HLB", "AMB", "BIMB", "BSN", "BKRM", "HSBC", "SCB", "AFFIN", "ABMB", "AGRO", "MUAMALAT", "KFH", "UOB", "CITI", "MBSB", "ICBC", "BOC", "GXS", "AEON", "TNG"];
const CODE_RE = new RegExp(`(?<!\\S)(?:${BANK_CODES.join("|")})(?=\\s)`, "g");

// Public Bank DuitNow names are cut to 25 characters; shorter names are followed by a space.
const PBB_NAME_WIDTH = 25;
const LEGAL_RE = /^(.*?(?:SDN\.?\s*BHD\.?|BERHAD|\bPLT\b|ENTERPRISES?|S\/B))/i;

type Described = Pick<ParsedTxn, "txnType" | "reference" | "counterparty">;

function tidy(s: string | null | undefined): string | null {
  const v = (s ?? "").replace(/\s+/g, " ").replace(/^[\s\-/|,.]+|[\s\-/|,]+$/g, "").trim();
  return v || null;
}

export function describeUob(descLines: string[]): Described {
  const raw = descLines.join(" ").replace(/\s+/g, " ").trim();
  const type = UOB_TYPES.find((t) => raw.toLowerCase().startsWith(t.toLowerCase()));
  const txnType = type ?? descLines[0] ?? null;
  const body = raw.slice(type ? type.length : (descLines[0] ?? "").length).split("|")[0].trim();

  if (type === "FPX Debit") {
    const m = body.match(/^(\S+)\s+(.+?)(?:\s+GEB)?$/);
    return { txnType, reference: tidy(m ? m[1] : body), counterparty: tidy(m?.[2]) };
  }

  const hits = [...body.matchAll(CODE_RE)];
  if (!hits.length) return { txnType, reference: tidy(body), counterparty: null };
  const after = (h: RegExpMatchArray) => body.slice((h.index ?? 0) + h[0].length).trimStart();
  const last = hits[hits.length - 1];
  const counterparty = tidy(after(last));
  const firstWord = counterparty?.split(" ")[0] ?? "";
  const start = hits.find((h) => after(h).startsWith(firstWord)) ?? last;
  return { txnType, reference: tidy(body.slice(0, start.index)), counterparty };
}

// Leading run of upper-case words: "LEE KUAN HONG Facebook Ads" -> "LEE KUAN HONG".
// A capitalised word glued to the name ("NG BOON PINDrunk cafe") is split off.
function leadingName(text: string): { name: string; sawLowercase: boolean } {
  const kept: string[] = [];
  for (const token of text.split(" ")) {
    const i = token.search(/[a-z]/);
    if (i < 0) {
      kept.push(token);
      continue;
    }
    if (i >= 3 && /[A-Z]/.test(token[i - 1])) kept.push(token.slice(0, i - 1));
    return { name: kept.join(" ").trim(), sawLowercase: true };
  }
  return { name: kept.join(" ").trim(), sawLowercase: false };
}

function pbbName(rest: string, fixedWidth: boolean): string | null {
  const window = rest.slice(0, fixedWidth ? PBB_NAME_WIDTH : 30);
  const legal = window.match(LEGAL_RE);
  if (legal) return legal[1];
  const lead = leadingName(rest).name;
  if (!fixedWidth) return lead || null;
  return lead && lead.length <= PBB_NAME_WIDTH ? lead : window;
}

export function describePbb(description: string, txnType: string | null): Pick<ParsedTxn, "reference" | "counterparty"> {
  const type = txnType ?? "";
  const m = description.match(/NO:(\d{6})(.*)$/);
  if (!m || !/^(DUITNOW|TSFR FUND)/i.test(type)) return { reference: null, counterparty: null };
  let rest = m[2].trim();

  if (/QR/i.test(type)) {
    const z = rest.search(/ZnerationZ/i);
    const after = z >= 0 ? rest.slice(z + "ZnerationZ".length) : "";
    const before = (z >= 0 ? rest.slice(0, z) : rest).replace(/^QR\d+/i, "").replace(/QR REF NO:\s*\S*/i, "");
    if (after && !/^QR REF/i.test(after)) return { reference: tidy(before), counterparty: tidy(after) };
    return { reference: null, counterparty: tidy(before) };
  }

  rest = rest.replace(/^X{4,}\d{3,4}\s*/, "");
  const name = pbbName(rest, /^DUITNOW/i.test(type));
  return { counterparty: tidy(name), reference: tidy(name ? rest.slice(name.length) : rest) };
}
