import type { BrokerParser, ImportResult, ParsedTransaction, ParsedOptionTransaction, AccountInfo } from './BrokerParser';

/**
 * Parses Schwab Form 1099 Composite & Year-End Summary (annual tax document).
 *
 * This document contains all closed positions for the tax year and open positions
 * at year-end. It is produced by Schwab in late January for the prior tax year.
 *
 * What is imported:
 * - Closed option transactions from "Realized Gain or (Loss)" → buy-to-close or sell-to-close
 * - Closed stock transactions from "Realized Gain or (Loss)" → sell
 * - Open options at year-end from "Options Activity" → buy-to-open or sell-to-open
 *
 * What is NOT imported:
 * - Assigned options (exercise/assignment creates stock transactions already in stock rows)
 * - Opening transactions for positions closed in prior years
 *
 * Action inference for closed options:
 * - Quantity suffix "S" = short position → buy-to-close (we opened as sell-to-open)
 * - No "S" suffix = long position → sell-to-close (we opened as buy-to-open)
 * - isExpired = true when the sold date equals the option expiration date
 *
 * Premium inference for closed options:
 * - Short (buy-to-close): premiumPerShare = costBasis / (qty × 100)  [cost = what we paid to close]
 * - Long (sell-to-close):  premiumPerShare = proceeds / (qty × 100)  [proceeds = what we received to close]
 *
 * Year-End Summary row formats (after pdfjs text extraction):
 *
 * Closed option row:
 *   TICKER MM/DD/YYYY STRIKE C/P QTY[S] MM/DD/YY MM/DD/YY $ PROCEEDS $ COST -- $ G/L [f]
 *   e.g.: AEHR 01/17/2025 15.00 C 2.00S 12/24/24 01/17/25 $ 288.66 $ 0.00 -- $ 288.66 f
 *   e.g.: AEHR 07/18/2025 20.00 C 8.00 07/08/25 07/18/25 $ 0.00 $ 507.29 -- $ (507.29) f
 *
 * Closed stock row:
 *   COMPANY NAME CUSIP QTY MM/DD/YY MM/DD/YY $ PROCEEDS $ COST -- $ G/L [f]
 *   e.g.: AEHR TEST SYS 00760J108 149.00 11/15/24 07/18/25 $ 2,293.58 $ 1,814.32 -- $ 479.26 f
 *
 * Open long option row (Options Activity):
 *   TICKER MM/DD/YYYY STRIKE C/P QTY MM/DD/YY $ AMOUNT
 *   e.g.: NVDA 01/16/2026 200.00 C 1.00 08/26/25 $ 1,185.66
 *
 * Open short option row (Options Activity):
 *   TICKER MM/DD/YYYY STRIKE C/P (QTY) MM/DD/YY $ (AMOUNT)
 *   e.g.: ASTS 12/17/2027 75.00 C (1.00) 10/13/25 $ (4,691.34)
 *
 * CUSIP / ticker mapping (from 1099-B section):
 *   CUSIP / TICKER   e.g.: 00760J108 / AEHR
 */

// Closed option row: two dates present, quantity may have S suffix.
// NOTE: S must be captured WITHOUT preceding \s* — otherwise the space between qty and date
// gets consumed by \s* when S is absent, leaving \s+ with nothing to match.
const CLOSED_OPTION_RE = /^([A-Z]{1,6})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+)\s+(C|P)\s+([\d.]+)(S?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})(.*)/i;

// Closed stock row: CUSIP is a 9-character alphanumeric token; two dates follow
const CLOSED_STOCK_RE = /^(.+?)\s+([0-9A-Z]{9})\s+([\d.]+)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})(.*)/;

// Open option row: one date; quantity may be in parentheses (short positions)
const OPEN_OPTION_RE = /^([A-Z]{1,6})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+)\s+(C|P)\s+\(?([\d.]+)\)?\s+(\d{2}\/\d{2}\/\d{2})(.*)/i;

// CUSIP / ticker mapping line in 1099-B section
const CUSIP_TICKER_RE = /([0-9A-Z]{9})\s*\/\s*([A-Z]{1,6})\b/g;

export class SchwabYearlyParser implements BrokerParser {
  name = 'Schwab 1099 / Year-End Summary';
  id = 'schwab-yearly';

  parse(pdfText: string): ImportResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];

    // Verify document type
    if (!/FORM\s+1099\s+COMPOSITE/i.test(pdfText) && !/YEAR-END\s+SUMMARY/i.test(pdfText)) {
      errors.push('Document does not appear to be a Schwab Form 1099 Composite or Year-End Summary');
      return { success: false, transactions, optionTransactions, errors, warnings };
    }

    // Extract tax year
    const yearMatch = pdfText.match(/TAX\s+YEAR\s+(\d{4})/i);
    const taxYear = yearMatch ? parseInt(yearMatch[1]) : null;
    if (!taxYear) {
      warnings.push('Could not determine tax year; date year inference may be imprecise');
    }

    // Extract account info
    const accountInfo = this.extractAccountInfo(pdfText);

    // Build CUSIP → ticker map from 1099-B section (for stock row identification)
    const cusipMap = this.buildCusipMap(pdfText);

    // Split into lines (needed for both section-finding and parsing)
    const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Find the ACTUAL Year-End Summary section start (not the TOC entry).
    // "YEAR-END SUMMARY INFORMATION IS NOT PROVIDED TO THE IRS" only appears
    // at the top of the actual section pages, not in the Table of Contents.
    // Using just "YEAR-END SUMMARY" would match the TOC entry on page 2, which
    // also contains "Terms and Conditions. . .24" — causing a premature break.
    let yearEndIdx = lines.findIndex(l =>
      /YEAR-END SUMMARY INFORMATION IS NOT PROVIDED TO THE IRS/i.test(l)
    );
    // Fallback: less specific match if the above isn't found (e.g. older format)
    if (yearEndIdx === -1) {
      yearEndIdx = lines.findIndex(l => /YEAR-END\s+SUMMARY/i.test(l));
    }
    if (yearEndIdx === -1) {
      warnings.push('No Year-End Summary section found in this document');
      return { success: true, transactions, optionTransactions, accountInfo, errors, warnings };
    }

    // Collect all option tickers visible in the Year-End Summary section.
    // Used as fallback when a stock CUSIP has no explicit CUSIP/TICKER pair in the 1099-B
    // (e.g. WOLFSPEED INC whose CUSIP 97785W106 never appears as "97785W106 / WOLF").
    const knownOptionTickers = this.buildOptionTickerSet(lines, yearEndIdx);

    // Track which section we're in as we scan
    type Section = 'none' | 'realized' | 'options_assigned' | 'options_open_long' | 'options_open_short';
    let section: Section = 'none';

    for (let i = yearEndIdx + 1; i < lines.length; i++) {
      const line = lines[i];

      // Section transitions
      if (/^REALIZED\s+GAIN\s+OR\s+\(LOSS\)/i.test(line)) {
        section = 'realized';
        continue;
      }
      if (/^OPTIONS\s+ACTIVITY/i.test(line)) {
        section = 'none'; // Will refine below
        continue;
      }
      if (/Assigned\s+(CALL|PUT|Options)/i.test(line)) {
        section = 'options_assigned';
        continue;
      }
      if (/Open\s+Long\s+(CALL|PUT|Options)/i.test(line)) {
        section = 'options_open_long';
        continue;
      }
      if (/Open\s+Short\s+(CALL|PUT|Options)/i.test(line)) {
        section = 'options_open_short';
        continue;
      }
      if (/^Terms\s+and\s+Conditions/i.test(line)) {
        break; // End of useful content
      }

      if (this.isSkippable(line)) continue;

      if (section === 'realized') {
        // Try option row first (more specific pattern)
        const optMatch = CLOSED_OPTION_RE.exec(line);
        if (optMatch) {
          const parsed = this.parseClosedOptionRow(optMatch, taxYear);
          if (parsed) optionTransactions.push(parsed);
          continue;
        }

        // Try stock row
        const stockMatch = CLOSED_STOCK_RE.exec(line);
        if (stockMatch) {
          const cusip = stockMatch[2];
          let ticker = cusipMap.get(cusip);
          if (!ticker) {
            // Fallback: infer ticker from company name prefix vs known option tickers
            // e.g. "WOLFSPEED INC" → first word "WOLFSPEED" starts with known ticker "WOLF"
            ticker = this.inferTickerFromCompanyName(stockMatch[1], knownOptionTickers) ?? undefined;
            if (ticker) {
              cusipMap.set(cusip, ticker); // cache for any subsequent rows with same CUSIP
            }
          }
          if (!ticker) {
            warnings.push(`Skipped stock row (unknown ticker for CUSIP ${cusip}): "${line.slice(0, 60)}"`);
            continue;
          }
          const parsed = this.parseClosedStockRow(stockMatch, ticker, taxYear);
          if (parsed) transactions.push(parsed);
        }
      } else if (section === 'options_open_long' || section === 'options_open_short') {
        const isLong = section === 'options_open_long';
        const optMatch = OPEN_OPTION_RE.exec(line);
        if (optMatch) {
          const parsed = this.parseOpenOptionRow(optMatch, isLong, taxYear);
          if (parsed) optionTransactions.push(parsed);
        }
      }
      // options_assigned: intentionally skipped (assignment creates stock transactions)
    }

    if (optionTransactions.length === 0 && transactions.length === 0) {
      warnings.push('No importable transactions found in Year-End Summary');
    } else {
      const note = taxYear ? ` for Tax Year ${taxYear}` : '';
      warnings.push(
        `Note: this import contains closing transactions only (from the 1099 perspective)${note}. ` +
        'Opening transactions for positions closed in prior years are not included.'
      );
    }

    return { success: true, transactions, optionTransactions, accountInfo, errors, warnings };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private parseClosedOptionRow(
    m: RegExpMatchArray,
    taxYear: number | null
  ): ParsedOptionTransaction | null {
    const ticker      = m[1].toUpperCase();
    const expiryStr   = m[2]; // MM/DD/YYYY
    const strike      = parseFloat(m[3]);
    const optionType  = m[4].toUpperCase() === 'C' ? 'call' : 'put' as 'call' | 'put';
    const qty         = parseFloat(m[5]);
    const isShort     = m[6].toUpperCase() === 'S';
    const dateSoldStr = m[8]; // MM/DD/YY — the CLOSING date
    const rest        = m[9];

    if (isNaN(qty) || qty <= 0 || isNaN(strike) || strike <= 0) return null;

    const expirationDate  = this.parseFullDate(expiryStr);
    const transactionDate = this.parseShortDate(dateSoldStr, taxYear);
    if (!expirationDate || !transactionDate) return null;

    const nums = this.extractNumbers(rest);
    if (nums.length < 2) return null;
    const proceeds  = nums[0];
    const costBasis = nums[1];

    const action: ParsedOptionTransaction['action'] = isShort ? 'buy-to-close' : 'sell-to-close';

    // Expired when closed on the expiration date itself
    const isExpired = transactionDate === expirationDate;

    // Closing price per share:
    //  • buy-to-close  → cost paid to buy back = costBasis / (qty × 100)
    //  • sell-to-close → proceeds received     = proceeds   / (qty × 100)
    const closingAmount  = isShort ? costBasis : proceeds;
    const premiumPerShare = closingAmount / (qty * 100);

    return {
      date: transactionDate,
      ticker,
      optionType,
      action,
      contracts: qty,
      strikePrice: strike,
      premiumPerShare,
      expirationDate,
      isExpired,
    };
  }

  private parseClosedStockRow(
    m: RegExpMatchArray,
    ticker: string,
    taxYear: number | null
  ): ParsedTransaction | null {
    // m[3]=qty, m[5]=dateSold, m[6]=rest
    const qty        = parseFloat(m[3]);
    const dateSoldStr = m[5];
    const rest       = m[6];

    if (isNaN(qty) || qty <= 0) return null;

    const date = this.parseShortDate(dateSoldStr, taxYear);
    if (!date) return null;

    const nums = this.extractNumbers(rest);
    if (nums.length < 1) return null;
    const proceeds = nums[0];

    return {
      date,
      ticker: ticker.toUpperCase(),
      action: 'sell',
      shares: qty,
      pricePerShare: qty > 0 ? proceeds / qty : 0,
      fees: 0,
    };
  }

  private parseOpenOptionRow(
    m: RegExpMatchArray,
    isLong: boolean,
    taxYear: number | null
  ): ParsedOptionTransaction | null {
    const ticker       = m[1].toUpperCase();
    const expiryStr    = m[2]; // MM/DD/YYYY
    const strike       = parseFloat(m[3]);
    const optionType   = m[4].toUpperCase() === 'C' ? 'call' : 'put' as 'call' | 'put';
    const qty          = parseFloat(m[5]);
    const openDateStr  = m[6]; // MM/DD/YY
    const rest         = m[7];

    if (isNaN(qty) || qty <= 0 || isNaN(strike) || strike <= 0) return null;

    const expirationDate  = this.parseFullDate(expiryStr);
    const transactionDate = this.parseShortDate(openDateStr, taxYear);
    if (!expirationDate || !transactionDate) return null;

    const nums = this.extractNumbers(rest);
    // Amount may be in parentheses for short positions (negative bookkeeping) — always take abs
    const amount = nums.length > 0 ? nums[0] : 0;
    const premiumPerShare = amount / (qty * 100);

    const action: ParsedOptionTransaction['action'] = isLong ? 'buy-to-open' : 'sell-to-open';

    return {
      date: transactionDate,
      ticker,
      optionType,
      action,
      contracts: qty,
      strikePrice: strike,
      premiumPerShare,
      expirationDate,
    };
  }

  /**
   * Collect all option tickers seen in the Year-End Summary section.
   * Used as fallback when a stock row's CUSIP has no explicit CUSIP/TICKER pair in the 1099-B.
   */
  private buildOptionTickerSet(lines: string[], yearEndIdx: number): Set<string> {
    const tickers = new Set<string>();
    for (let i = yearEndIdx; i < lines.length; i++) {
      const m = CLOSED_OPTION_RE.exec(lines[i]) || OPEN_OPTION_RE.exec(lines[i]);
      if (m) tickers.add(m[1].toUpperCase());
    }
    return tickers;
  }

  /**
   * Try to infer a stock ticker from the company name by checking whether the
   * first word of the company name STARTS WITH a known option ticker.
   * Example: "WOLFSPEED INC" → first word "WOLFSPEED" starts with known ticker "WOLF".
   * Returns the longest matching ticker (min length 2) or null if no match.
   */
  private inferTickerFromCompanyName(companyName: string, knownTickers: Set<string>): string | null {
    const firstWord = companyName.trim().split(/\s+/)[0].toUpperCase();
    let best: string | null = null;
    for (const ticker of knownTickers) {
      if (
        ticker.length >= 2 &&
        firstWord.startsWith(ticker) &&
        firstWord.length > ticker.length && // first word is longer than ticker — not an exact match
        (!best || ticker.length > best.length)
      ) {
        best = ticker;
      }
    }
    return best;
  }

  private extractAccountInfo(pdfText: string): AccountInfo | undefined {
    // The account number appears as "Account Number\n...54" or "Account Number: 54"
    const m = pdfText.match(/Account\s+Number\s*[:\s]+(\d+)/i);
    const acctNum = m ? m[1] : 'Unknown';
    return {
      accountNumber: acctNum.slice(-4),
      broker: 'Schwab',
      accountType: 'brokerage',
    };
  }

  private buildCusipMap(pdfText: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = new RegExp(CUSIP_TICKER_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(pdfText)) !== null) {
      map.set(m[1], m[2]);
    }
    return map;
  }

  private isSkippable(line: string): boolean {
    return (
      /^Security\s+Subtotal/i.test(line)       ||
      /^Total\s+(Short|Long|Assigned)/i.test(line) ||
      /^TOTAL\s+REALIZED/i.test(line)           ||
      /^Short-Term\s+Realized/i.test(line)      ||
      /^Long-Term\s+Realized/i.test(line)       ||
      /^Realized\s+Gain\s+or/i.test(line)       ||
      /^Please\s+see/i.test(line)               ||
      /^This\s+section\s+is/i.test(line)        ||
      /^The\s+(information|transactions)/i.test(line) ||
      /^Description\s+OR/i.test(line)           ||
      /^Option\s+Symbol/i.test(line)            ||
      /^Total\s+(Open|Short|Long)\s+Options/i.test(line) ||
      /^Total\s+(Assigned|Open)/i.test(line)    ||
      /^Assigned\s+(Gain|Loss)/i.test(line)     ||
      /^INTEREST\s+&\s+DIVIDENDS/i.test(line)   ||
      /^Detail\s+Information/i.test(line)       ||
      /^Notes\s+for/i.test(line)                ||
      /^Endnotes\s+for/i.test(line)             ||
      /^Symbol\s+Endnote/i.test(line)           ||
      /^[Ss]\s+Short\s+sale/i.test(line)        ||
      /^Schwab\s+has\s+provided/i.test(line)    ||
      /^When\s+value/i.test(line)               ||
      line.length < 5
    );
  }

  /** MM/DD/YYYY → YYYY-MM-DD */
  private parseFullDate(s: string): string | null {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[1]}-${m[2]}`;
  }

  /** MM/DD/YY → YYYY-MM-DD, inferring century from taxYear */
  private parseShortDate(s: string, taxYear: number | null): string | null {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (!m) return null;
    const yy = parseInt(m[3]);
    const century = taxYear ? Math.floor(taxYear / 100) * 100 : 2000;
    const year = century + yy;
    return `${year}-${m[1]}-${m[2]}`;
  }

  /**
   * Extract numeric values from the trailing portion of a row.
   * Strips $, --, endnote letters (f), commas, and parentheses.
   * Returns values in left-to-right order: [proceeds, costBasis, gainLoss?, ...]
   */
  private extractNumbers(str: string): number[] {
    const cleaned = str
      .replace(/\$/g, ' ')     // replace $ with space (not empty) to avoid concatenating adjacent numbers
      .replace(/--/g, ' ')     // remove placeholder dashes
      .replace(/\s+[a-z]\s*$/i, ''); // remove trailing endnote letter (f, etc.)

    const nums: number[] = [];
    const re = /\(?([\d,]+\.?\d*)\)?/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(cleaned)) !== null) {
      const v = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(v)) nums.push(v);
    }
    return nums;
  }
}
