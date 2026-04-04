import type { BrokerParser, ImportResult, ParsedTransaction, ParsedOptionTransaction, AccountInfo } from './BrokerParser';

/**
 * Parses IBKR (Interactive Brokers) Transaction History PDF.
 *
 * Generated via: Statements → Activity → Transaction History (custom date range).
 * The PDF can span any date range — days, months, or years.
 *
 * What is imported:
 * - Option trades (Buy/Sell) → buy-to-open, sell-to-open, buy-to-close, sell-to-close
 * - Stock assignments → buy (stock purchase at assignment price)
 *
 * What is NOT imported:
 * - Other Fee, Deposit, Withdrawal, Credit Interest lines
 *
 * Open/close inference:
 *   IBKR only records "Buy" or "Sell" — not "to open/close". This parser infers
 *   the action by tracking a running position quantity per option key, processing
 *   lines in chronological order (the statement is newest-first, so lines are
 *   reversed before parsing):
 *     - Sell (qty < 0): prior qty ≥ 0 → sell-to-open; prior qty > 0 → sell-to-close
 *     - Buy  (qty > 0): prior qty ≤ 0 → buy-to-open;  prior qty < 0 → buy-to-close
 *   Starting position is assumed to be 0 (import statements oldest-first for accuracy).
 *
 * OCC option symbol format used by IBKR:
 *   "AMD 260501C00215000"
 *    └─ ticker ─┘ └YYMMDD┘└C/P┘└─ strike × 1000, zero-padded to 8 digits ─┘
 *   e.g.: AMD, expiry = 2026-05-01, call, strike = $215.00
 *
 * Line format after pdfjs text extraction:
 *   Option:     DATE ACCOUNT DESC Buy|Sell OCC_SYMBOL QTY PRICE USD GROSS
 *   Assignment: DATE ACCOUNT ...Buy N COMPANY (Assignment) Assignment TICKER QTY PRICE USD GROSS
 *   Fee/cash:   DATE ACCOUNT long-description Other Fee|Deposit|Withdrawal|Credit Interest ...
 */

// Option transaction line:
// DATE  ACCOUNT  DESCRIPTION  (Buy|Sell)  OCC_SYMBOL  QTY  PRICE  USD  GROSS
// The description may contain spaces so we use a non-greedy match up to Buy|Sell keyword.
// The OCC symbol is: TICKER space YYMMDD[CP]8DIGITS
const OPT_LINE_RE =
  /^(\d{4}-\d{2}-\d{2})\s+\S+\s+.+?\s+(Sell|Buy)\s+([A-Z]+\s+\d{6}[CP]\d{8})\s+([-\d.]+)\s+([\d.,]+)\s+USD/i;

// OCC symbol parser
const OCC_SYMBOL_RE = /^([A-Z]+)\s+(\d{6})([CP])(\d{8})$/i;

// Assignment line: contains "(Assignment)" in description and "Assignment" as transaction type
// DATE  ACCOUNT  ...Buy N COMPANY (Assignment)  Assignment  TICKER  QTY  PRICE  USD  GROSS
const ASSIGN_LINE_RE =
  /^(\d{4}-\d{2}-\d{2})\s+\S+\s+.+?\(Assignment\)\s+Assignment\s+([A-Z]+)\s+([\d.,]+)\s+([\d.,]+)\s+USD/i;

// Account number: U***37139 → extract trailing digits
const ACCOUNT_RE = /U\*+(\d+)/;

// Lines to skip (transaction type appears as a whole word somewhere on the line)
const SKIP_RE = /\b(Other Fee|Deposit|Withdrawal|Credit Interest)\b/i;

export class IBKRParser implements BrokerParser {
  name = 'IBKR Transaction History';
  id = 'ibkr';

  parse(pdfText: string): ImportResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];

    // Validate document type
    if (!/Transaction History/i.test(pdfText) || !/Interactive Brokers/i.test(pdfText)) {
      errors.push('Document does not appear to be an IBKR Transaction History');
      return { success: false, transactions, optionTransactions, errors, warnings };
    }

    // Extract account info
    const accountInfo = this.extractAccountInfo(pdfText);

    // Split into lines, filter blanks
    const rawLines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Statement is newest-first; reverse to process chronologically for position tracking
    const lines = [...rawLines].reverse();

    // Running position quantities per option key (ticker|expiry|strike|type)
    const positionMap = new Map<string, number>();

    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;

      // Try option transaction
      const optMatch = OPT_LINE_RE.exec(line);
      if (optMatch) {
        const parsed = this.parseOptionLine(optMatch, positionMap);
        if (parsed) optionTransactions.push(parsed);
        continue;
      }

      // Try assignment
      const assignMatch = ASSIGN_LINE_RE.exec(line);
      if (assignMatch) {
        const parsed = this.parseAssignmentLine(assignMatch);
        if (parsed) transactions.push(parsed);
        continue;
      }
    }

    if (optionTransactions.length === 0 && transactions.length === 0) {
      warnings.push('No importable transactions found in Transaction History');
    } else {
      warnings.push(
        'Note: open/close action (buy-to-open vs buy-to-close) is inferred from position tracking. ' +
        'For best accuracy, import statements in chronological order starting from account opening.'
      );
    }

    return { success: true, transactions, optionTransactions, accountInfo, errors, warnings };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private parseOptionLine(
    m: RegExpMatchArray,
    positionMap: Map<string, number>
  ): ParsedOptionTransaction | null {
    const date      = m[1]; // already YYYY-MM-DD
    const buyOrSell = m[2].toLowerCase(); // 'buy' or 'sell'
    const occSymbol = m[3];
    const qty       = parseFloat(m[4]);
    const price     = parseFloat(m[5].replace(/,/g, ''));

    if (isNaN(qty) || qty === 0 || isNaN(price)) return null;

    const fields = this.parseOccSymbol(occSymbol);
    if (!fields) return null;

    const { ticker, expirationDate, optionType, strikePrice } = fields;
    const posKey = `${ticker}|${expirationDate}|${strikePrice}|${optionType}`;

    const priorQty = positionMap.get(posKey) ?? 0;
    const contracts = Math.abs(qty);

    // Infer action
    let action: ParsedOptionTransaction['action'];
    if (buyOrSell === 'sell') {
      // qty is negative; selling
      action = priorQty > 0 ? 'sell-to-close' : 'sell-to-open';
      positionMap.set(posKey, priorQty - contracts);
    } else {
      // qty is positive; buying
      action = priorQty < 0 ? 'buy-to-close' : 'buy-to-open';
      positionMap.set(posKey, priorQty + contracts);
    }

    return {
      date,
      ticker,
      optionType,
      action,
      contracts,
      strikePrice,
      premiumPerShare: price,
      expirationDate,
    };
  }

  private parseAssignmentLine(m: RegExpMatchArray): ParsedTransaction | null {
    const date   = m[1];
    const ticker = m[2].toUpperCase();
    const shares = parseFloat(m[3].replace(/,/g, ''));
    const price  = parseFloat(m[4].replace(/,/g, ''));

    if (isNaN(shares) || shares <= 0 || isNaN(price)) return null;

    return {
      date,
      ticker,
      action: 'buy',
      shares,
      pricePerShare: price,
      fees: 0,
      notes: 'Option assignment',
    };
  }

  private parseOccSymbol(sym: string): {
    ticker: string;
    expirationDate: string;
    optionType: 'call' | 'put';
    strikePrice: number;
  } | null {
    const m = OCC_SYMBOL_RE.exec(sym.trim());
    if (!m) return null;

    const ticker = m[1].toUpperCase();
    const yymmdd = m[2]; // e.g. "260501"
    const cpChar = m[3].toUpperCase();
    const strikeRaw = m[4]; // e.g. "00215000"

    // Expiry: YYMMDD → YYYY-MM-DD
    const yy = yymmdd.slice(0, 2);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6);
    const year = parseInt(yy) + 2000; // valid for years 2000–2099
    const expirationDate = `${year}-${mm}-${dd}`;

    const optionType: 'call' | 'put' = cpChar === 'C' ? 'call' : 'put';
    const strikePrice = parseInt(strikeRaw, 10) / 1000;

    if (isNaN(strikePrice) || strikePrice <= 0) return null;

    return { ticker, expirationDate, optionType, strikePrice };
  }

  private extractAccountInfo(pdfText: string): AccountInfo | undefined {
    const m = ACCOUNT_RE.exec(pdfText);
    return {
      accountNumber: m ? m[1].slice(-4) : 'Unknown',
      broker: 'IBKR',
      accountType: 'brokerage',
    };
  }
}
