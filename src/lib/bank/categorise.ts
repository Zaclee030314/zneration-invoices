// First-guess categories for imported transactions. The team can change any of
// them; these rules only save typing on the obvious ones.
import { compact } from "./money";
import type { BankCode, ParsedTxn, TxnCategory } from "./types";

// Tokens of 5+ letters match anywhere in the squashed text (bank text often glues or
// truncates words); shorter ones must be whole words so "FEE" never matches "COFFEE".
// Regular expressions are tested against the upper-cased original text.
type Token = string | RegExp;

const RULES: { category: TxnCategory; tokens: Token[] }[] = [
  { category: "bank_charges", tokens: [/^(SC|SST DR)-/, "SERVICE CHARGE", "BANK CHARGE", "STAMP DUTY", "ANNUAL FEE"] },
  {
    category: "refund",
    // Public Bank cuts letters out of long references: "Deposit Rend", "Depositfund", "DeposRefund".
    tokens: ["REFUN", "EFUND", "REFD", "REFU", "DEPOSITR", "DEPOSITF", "DEPOSREF", "DEPOSIREF", "DEPOTREF", "DESITREF", "DEPITREF"],
  },
  { category: "salary", tokens: ["SALARY", "SALARI", "GAJI", "WAGE", "WAGES", "ALLOWANCE", "BONUS", "PAYROLL"] },
  { category: "loan_advance", tokens: ["BORROW", "LOAN", "ADVANCE", "PINJAM"] },
  {
    category: "advertising",
    tokens: ["FACEBOO", "FB", "ADS", "GOOGLE ADS", "TIKTOK", "XHS", "XIAOHONGSHU", "KOL", "BLOGGER", "INFLUENCER", "MOBI ASIA", "MARKETING"],
  },
  {
    category: "tax_statutory",
    tokens: ["KUMPULAN WANG", "KWSP", "EPF", "PERTUBUHAN KESELAMAT", "PERKESO", "SOCSO", "EIS", "LHDN", "HASIL", "CUKAI", "TAX", "SSM", "MAJLIS BANDARAYA", "MBPJ", "LESEN", "LICENSE", "LICENCE", "DBKL"],
  },
  { category: "rental", tokens: ["RENTAL", "RENT", "SEWA", "TENANCY"] },
  {
    category: "software",
    tokens: ["CLAUDE", "CHATGPT", "OPENAI", "OPENCLAW", "KIMI", "VERCEL", "SUPABASE", "MANYCHAT", "SHINJIRU", "CANVA", "ADOBE", "GOOGLE", "MICROSOFT", "NOTION", "TRIPO", "API", "SUBSCRI", "HOSTING", "DOMAIN", "UNIFI", "TELEKOM", "MAXIS", "CELCOM", "DIGI"],
  },
  {
    category: "transport",
    tokens: ["LALAMOVE", "GRAB", "MOVER", "LORRY", "TOLL", "PETROL", "FLEETCARD", "SHELL", "PETRONAS", "PARKING", "CAR FIX", "TRANSPORT", "DELIVERY", "COURIER", "POSLAJU"],
  },
  { category: "meals", tokens: ["MEAL", "MEALS", "FOOD", "LUNCH", "DINNER", "MAKAN"] },
  {
    category: "purchases",
    tokens: ["SHOPEE", "LAZADA", "TAOBAO", "PURCHASE", "PUCHA", "PUHASE", "PRINT", "CARTON", "PACKAGIN", "CONSIGNMENT", "DOORGIFT", "LANYARD", "ACRYLIC", "HARDWARE"],
  },
  {
    category: "contractors",
    tokens: ["EDITING", "EDITOR", "VIDEO", "DESIGN", "PHOTO", "BUSKER", "PROMOTER", "CREW", "FREELANCE", "COMMISSION", "WORKER", "SHOOTING"],
  },
  { category: "professional_fees", tokens: ["ACCOUNTING", "ACCOUNTANT", "AUDIT", "SECRETARIAL", "LEGAL", "LAWYER", "CONSULT", "FEES"] },
  {
    category: "event_costs",
    tokens: ["CANOPY", "MARQUEE", "TENT", "ELECTRIC", "BOOTH", "PRIZE", "BAZAAR", "EVENT", "DECO", "GENSET", "PAWRADISE", "LUMI", "SUNSET SOCIAL", "MEGAH"],
  },
  { category: "staff_claim", tokens: ["CLAIM", "REIMBURSE"] },
];

function tokenMatches(token: Token, upper: string, spaced: string, packed: string): boolean {
  if (token instanceof RegExp) return token.test(upper);
  const squashed = compact(token);
  if (squashed.length >= 5) return packed.includes(squashed);
  return spaced.includes(` ${token.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `);
}

// Transfers between the company's own accounts: the other party carries the account holder's
// own name. UOB "Fund Trf EB" salary lines print the company name too but pay someone else.
export function isOwnTransfer(bank: BankCode, accountName: string | null, t: Pick<ParsedTxn, "txnType" | "counterparty">): boolean {
  const own = compact(accountName);
  const other = compact(t.counterparty);
  if (own.length < 8 || other.length < 12) return false;
  if (!own.startsWith(other) && !other.startsWith(own)) return false;
  const type = t.txnType ?? "";
  return bank === "UOB" ? !/^Fund Trf EB/i.test(type) : /^(DUITNOW TRSF|TSFR FUND)/i.test(type);
}

export function suggestCategory(
  bank: BankCode,
  accountName: string | null,
  t: Pick<ParsedTxn, "direction" | "txnType" | "description" | "counterparty">
): TxnCategory | null {
  if (isOwnTransfer(bank, accountName, t)) return "own_transfer";
  if (t.direction === "in") return null;
  const upper = `${t.txnType ?? ""} ${t.description}`.toUpperCase();
  const spaced = ` ${upper.replace(/[^A-Z0-9]+/g, " ").trim()} `;
  const packed = compact(upper);
  for (const rule of RULES) {
    if (rule.tokens.some((token) => tokenMatches(token, upper, spaced, packed))) return rule.category;
  }
  return null;
}
