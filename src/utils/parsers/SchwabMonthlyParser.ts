import type { BrokerParser, ImportResult, ParsedTransaction, ParsedOptionTransaction, AccountInfo } from './BrokerParser';

/**
 * Parses Schwab monthly brokerage statements.
 *
 * After pdfjs Y-sorted text extraction + glyph merging, each visual table row
 * becomes one line. Multi-line cells cause fields to appear on CONTINUATION
 * LINES. The continuation may not be the immediately-next line — intermediate
 * lines (e.g. repeated column headers, spacing rows) may appear between.
 *
 * Observed real-PDF formats (January 2026 statement):
 *
 * A) Expiry on SAME line:
 *    "01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67"
 *    "26.00 P EXP 01/16/26"
 *
 * B) Expiry on CONTINUATION line:
 *    "01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)"
 *    "01/15/2027 35.00 EXP 01/15/27 C"
 *
 * C) "Other Activity" split:
 *    "01/20 Other Expired Short NVDA CALL NVIDIA CORP $200 EXP (1.0000)"
 *    "Activity 01/16/2026 01/16/26 200.00 C"
 *
 * D) No leading date, expiry on same line:
 *    "Other Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 2.0000"
 *    "Activity 26.00 P EXP 01/16/26"
 *
 * E) Short Sale (Category="Sale" + Action="Short Sale" merged):
 *    "10/14 Sale Short Sale ASTS CALL AST SPACEMOBILE INC$75 EXP 12/17/27 (1.0000) 46.9200 0.66 4,691.34"
 *    "12/17/2027 75.00 C"
 *
 * F) Cover Short (Category="Purchase" + Action="Cover Short" merged):
 *    "Purchase Cover Short ASTS CALL AST SPACEMOBILE INC$50 EXP 10/24/25 1.0000 37.2700 0.66 (3,727.66) (3,273.32)(ST)"
 *    "10/24/2025 50.00 C"
 *
 * Note: Realized gain/loss columns may append ,(ST) or (ST) to the last number — stripped before parsing.
 */

// Action alternatives — ordered most-specific first to prevent partial matches
const ACTION_RE_PART = '(Sale\\s+Short\\s+Sale|Short\\s+Sale|Purchase\\s+Cover\\s+Short|Cover\\s+Short|Sale|Purchase|Other(?:\\s+Activity)?(?:\\s+Expired\\s+(?:Short|Long))?)';

// Matches a transaction header line with TICKER then MM/DD/YYYY (expiry on same line)
const OPTION_WITH_EXPIRY_RE = new RegExp(
  `^(?:(\\d{1,2}\\/\\d{1,2})\\s+)?${ACTION_RE_PART}\\s+([A-Z]{1,6})\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(CALL|PUT)\\s*(.*)`,
  'i'
);

// Matches a transaction header line where expiry is NOT on this line
const OPTION_NO_EXPIRY_RE = new RegExp(
  `^(?:(\\d{1,2}\\/\\d{1,2})\\s+)?${ACTION_RE_PART}\\s+([A-Z]{1,6})\\s+(CALL|PUT)\\s*(.*)`,
  'i'
);

// Matches a stock transaction line (no CALL/PUT keyword present)
const STOCK_LINE_RE = /^(\d{1,2}\/\d{1,2})\s+(Sale|Purchase)\s+([A-Z]{1,6})\s+(.*)/;

// A line that starts a NEW transaction — used to bound lookahead
const NEW_TXN_RE = /^(?:\d{1,2}\/\d{1,2}\s+)?(?:Sale|Purchase|Other\s+(?:Activity|Expired))/i;

// Extracts a full expiry date (MM/DD/YYYY) from anywhere in a line
const EXPIRY_DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/;

// Extracts strike + C/P from a continuation line.
// Handles: "26.00 P", "200.00 C", "35.00 EXP 01/15/27 C", "35.00 C"
// The strike is the last standalone decimal number before C or P.
const STRIKE_CP_RE = /([\d.]+)\s+(?:EXP\s+\d{2}\/\d{2}\/\d{2}\s+)?([CP])\b/i;

export class SchwabMonthlyParser implements BrokerParser {
  name = 'Schwab Monthly Statement';
  id = 'schwab-monthly';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const accountInfo = this.extractAccountInfo(pdfText);
      const year = this.extractYear(pdfText);

      const startIdx = pdfText.search(/Transaction\s+Details/i);
      if (startIdx === -1) {
        warnings.push('No Transaction Details section found — this statement may have no trades for the period');
        return { success: true, transactions: [], optionTransactions: [], accountInfo, errors, warnings };
      }

      const endIdx = pdfText.search(/Total\s+Transactions/i);
      const section = endIdx !== -1 ? pdfText.substring(startIdx, endIdx) : pdfText.substring(startIdx);

      const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      let currentDate: string | null = null;
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        // ---------------------------------------------------------------
        // Try option WITH expiry on same line
        // ---------------------------------------------------------------
        const withExpiry = OPTION_WITH_EXPIRY_RE.exec(line);
        if (withExpiry) {
          if (withExpiry[1]) currentDate = withExpiry[1];
          const date = currentDate ?? '01/01';
          const actionStr = withExpiry[2].trim();
          const ticker = withExpiry[3];
          const expiryRaw = withExpiry[4];
          const callPut = withExpiry[5].toUpperCase() as 'CALL' | 'PUT';
          const rest = withExpiry[6];
          i++;

          const { nums } = this.extractTrailingNumbers(rest);

          // Look ahead (up to 5 lines) for strike + C/P continuation
          const bound = Math.min(i + 5, lines.length);
          let strike: number | null = null;
          let optionType: 'call' | 'put' = callPut === 'CALL' ? 'call' : 'put';

          for (let j = i; j < bound; j++) {
            const cl = lines[j];
            if (j > i && NEW_TXN_RE.test(cl)) break;
            if (/^Commission/i.test(cl)) continue;
            const m = STRIKE_CP_RE.exec(cl);
            if (m) {
              strike = parseFloat(m[1]);
              optionType = m[2].toUpperCase() === 'C' ? 'call' : 'put';
              i = j + 1;
              // skip trailing commission line
              if (i < lines.length && /^Commission/i.test(lines[i])) i++;
              break;
            }
          }

          if (strike === null) strike = this.extractStrikeFromDesc(rest);

          const isExpired = this.isExpiredAction(actionStr);
          const [em, ed, ey] = expiryRaw.split('/');
          const expirationDate = `${ey}-${em}-${ed}`;
          // For expired options, use expiration date as transaction date (semantically correct)
          const txnDate = isExpired ? expirationDate : this.parseDate(`${date}/${year}`);

          const { qty, premiumPerShare, fees } = this.extractOptionNums(nums);

          if (qty > 0 && strike !== null) {
            optionTransactions.push({
              date: txnDate,
              ticker,
              optionType,
              action: this.mapOptionAction(actionStr),
              contracts: qty,
              strikePrice: strike,
              premiumPerShare,
              expirationDate,
              fees,
              isExpired,
              notes: `Imported from Schwab monthly statement${this.expiredNote(actionStr)}`
            });
          } else {
            warnings.push(`Skipped option (missing data): ${line}`);
          }
          continue;
        }

        // ---------------------------------------------------------------
        // Try option WITHOUT expiry on main line
        // ---------------------------------------------------------------
        const noExpiry = OPTION_NO_EXPIRY_RE.exec(line);
        if (noExpiry) {
          if (noExpiry[1]) currentDate = noExpiry[1];
          const date = currentDate ?? '01/01';
          const actionStr = noExpiry[2].trim();
          const ticker = noExpiry[3];
          const callPut = noExpiry[4].toUpperCase() as 'CALL' | 'PUT';
          const rest = noExpiry[5];
          i++;

          const { nums } = this.extractTrailingNumbers(rest);

          // Look ahead up to 5 lines for expiry date, strike, and C/P.
          // Stop early if we hit a NEW transaction line (but not on j==i).
          const bound = Math.min(i + 5, lines.length);
          let expiryRaw: string | null = null;
          let strike: number | null = null;
          let optionType: 'call' | 'put' = callPut === 'CALL' ? 'call' : 'put';
          let lastContJ = i - 1;

          for (let j = i; j < bound; j++) {
            const cl = lines[j];
            if (j > i && NEW_TXN_RE.test(cl)) break;
            if (/^Commission/i.test(cl)) { lastContJ = j; continue; }

            // Try to extract expiry date from this line
            const expM = EXPIRY_DATE_RE.exec(cl);
            if (expM && expiryRaw === null) expiryRaw = expM[1];

            // Try to extract strike + C/P
            const cpM = STRIKE_CP_RE.exec(cl);
            if (cpM && strike === null) {
              strike = parseFloat(cpM[1]);
              optionType = cpM[2].toUpperCase() === 'C' ? 'call' : 'put';
            }

            lastContJ = j;
            if (expiryRaw !== null && strike !== null) break;
          }

          i = lastContJ + 1;
          // skip trailing commission line
          if (i < lines.length && /^Commission/i.test(lines[i])) i++;

          if (strike === null) strike = this.extractStrikeFromDesc(rest);

          if (expiryRaw === null) {
            warnings.push(`No expiry date found for option: ${line}`);
            continue;
          }

          const isExpired = this.isExpiredAction(actionStr);
          const [em, ed, ey] = expiryRaw.split('/');
          const expirationDate = `${ey}-${em}-${ed}`;
          const txnDate = isExpired ? expirationDate : this.parseDate(`${date}/${year}`);

          const { qty, premiumPerShare, fees } = this.extractOptionNums(nums);

          if (qty > 0 && strike !== null) {
            optionTransactions.push({
              date: txnDate,
              ticker,
              optionType,
              action: this.mapOptionAction(actionStr),
              contracts: qty,
              strikePrice: strike,
              premiumPerShare,
              expirationDate,
              fees,
              isExpired,
              notes: `Imported from Schwab monthly statement${this.expiredNote(actionStr)}`
            });
          } else {
            warnings.push(`Skipped option (missing data): ${line}`);
          }
          continue;
        }

        // ---------------------------------------------------------------
        // Try stock transaction
        // ---------------------------------------------------------------
        const stockMatch = STOCK_LINE_RE.exec(line);
        if (stockMatch) {
          currentDate = stockMatch[1];
          const category = stockMatch[2];
          const ticker = stockMatch[3];
          const rest = stockMatch[4];
          i++;

          const { nums } = this.extractTrailingNumbers(rest);

          // Skip continuation lines belonging to this stock row
          while (
            i < lines.length &&
            !OPTION_WITH_EXPIRY_RE.test(lines[i]) &&
            !OPTION_NO_EXPIRY_RE.test(lines[i]) &&
            !STOCK_LINE_RE.test(lines[i])
          ) {
            i++;
          }

          if (nums.length >= 2) {
            transactions.push({
              date: this.parseDate(`${currentDate}/${year}`),
              ticker,
              action: /^Sale/i.test(category) ? 'sell' : 'buy',
              shares: Math.abs(nums[0]),
              pricePerShare: nums[1],
              fees: nums.length >= 4 ? nums[2] : 0,
              notes: 'Imported from Schwab monthly statement'
            });
          }
          continue;
        }

        i++;
      }

      if (transactions.length === 0 && optionTransactions.length === 0) {
        warnings.push('No importable transactions found in this statement (may contain only corporate actions such as Liquidation or Redemption)');
      }

      return {
        success: true,
        transactions,
        optionTransactions,
        accountInfo,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, transactions: [], optionTransactions: [], accountInfo: undefined, errors, warnings };
    }
  }

  private isExpiredAction(actionStr: string): boolean {
    return /Expired\s+(?:Short|Long)/i.test(actionStr);
  }

  private mapOptionAction(actionStr: string): 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close' {
    if (/Expired\s+Short/i.test(actionStr)) return 'buy-to-close';
    if (/Expired\s+Long/i.test(actionStr)) return 'sell-to-close';
    if (/Short\s+Sale/i.test(actionStr)) return 'sell-to-open';
    if (/Cover\s+Short/i.test(actionStr)) return 'buy-to-close';
    if (/^Sale/i.test(actionStr)) return 'sell-to-open';
    return 'buy-to-open';
  }

  private expiredNote(actionStr: string): string {
    if (/Expired\s+Short/i.test(actionStr)) return ' (expired short)';
    if (/Expired\s+Long/i.test(actionStr)) return ' (expired long)';
    if (/Short\s+Sale/i.test(actionStr)) return ' (short sale)';
    if (/Cover\s+Short/i.test(actionStr)) return ' (cover short)';
    return '';
  }

  private extractOptionNums(nums: number[]): { qty: number; premiumPerShare: number; fees: number } {
    return {
      qty: nums.length >= 1 ? Math.abs(nums[0]) : 0,
      premiumPerShare: nums.length >= 2 ? nums[1] : 0,
      fees: nums.length >= 3 ? nums[2] : 0
    };
  }

  private extractTrailingNumbers(str: string): { nums: number[]; desc: string } {
    const nums: number[] = [];
    // Strip realized gain/loss type annotations: ,(ST), (ST), ,(LT), (LT) etc.
    let rest = str.trimEnd().replace(/[,\s]*\([A-Z]+\)$/, '');
    const re = /\s+(\([\d,]+\.?\d*\)|[\d,]+\.?\d*)$/;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
      const val = parseFloat(m[1].replace(/[(),]/g, '').replace(/,/g, ''));
      if (isNaN(val)) break;
      nums.unshift(val);
      rest = rest.slice(0, rest.length - m[0].length);
    }
    return { nums, desc: rest.trim() };
  }

  private extractStrikeFromDesc(desc: string): number | null {
    const m = desc.match(/\$(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  private extractYear(pdfText: string): string {
    const m = pdfText.match(
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+-\d+,\s+(\d{4})/i
    );
    return m ? m[1] : new Date().getFullYear().toString();
  }

  private parseDate(dateStr: string): string {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${month}-${day}`;
  }

  private extractAccountInfo(pdfText: string): AccountInfo | undefined {
    const accountMatch =
      pdfText.match(/Account\s+(?:Number|#|Acct)?\s*:?\s*[*X]*([\dX*-]{4,20})/i) ??
      pdfText.match(/([\dX*]{3,6}-[\dX*]{3,6})/);

    if (!accountMatch) return undefined;

    let accountType: 'brokerage' | 'retirement' | 'margin' | 'crypto' | undefined;
    const typeMatch = pdfText.match(/(?:Account\s+)?Type\s*:?\s*(.*?)(?:\n|$)/i);
    if (typeMatch) {
      const t = typeMatch[1].toLowerCase();
      if (t.includes('ira') || t.includes('retirement') || t.includes('401k')) {
        accountType = 'retirement';
      } else if (t.includes('margin')) {
        accountType = 'margin';
      } else {
        accountType = 'brokerage';
      }
    }

    return { accountNumber: accountMatch[1], broker: 'Schwab', accountType };
  }
}
