import type { BrokerParser, ImportResult, ParsedTransaction, ParsedOptionTransaction, AccountInfo } from './BrokerParser';

/**
 * Parses Schwab monthly brokerage statements.
 *
 * After pdfjs Y-sorted text extraction + glyph merging, each visual table row
 * becomes one line. However, multi-line cells cause some fields to appear on
 * CONTINUATION LINES rather than the main transaction line.
 *
 * Observed real-PDF formats (January 2026 statement):
 *
 * A) Expiry on SAME line as ticker (SOFI sell/expired-long):
 *    "01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67"
 *    "26.00 P EXP 01/16/26"
 *
 * B) Expiry on CONTINUATION line (AEHR buy-to-open):
 *    "01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)"
 *    "01/15/2027 35.00 EXP 01/15/27 C"
 *
 * C) "Other Activity" split — "Activity" on next visual row (NVDA expired-short):
 *    "01/20 Other Expired Short NVDA CALL NVIDIA CORP $200 EXP (1.0000)"
 *    "Activity 01/16/2026 01/16/26 200.00 C"
 *
 * D) No date, "Other Expired Long", expiry on same line (SOFI expired-long):
 *    "Other Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 2.0000"
 *    "Activity 26.00 P EXP 01/16/26"
 */

// Option with expiry on same line:
//   [MM/DD] (Sale|Purchase|Other…) TICKER MM/DD/YYYY (CALL|PUT) rest
const OPTION_WITH_EXPIRY_RE = /^(?:(\d{1,2}\/\d{1,2})\s+)?(Sale|Purchase|Other(?:\s+Activity)?(?:\s+Expired\s+(?:Short|Long))?)\s+([A-Z]{1,6})\s+(\d{2}\/\d{2}\/\d{4})\s+(CALL|PUT)\s*(.*)/i;

// Option WITHOUT expiry on main line (expiry will be on continuation):
//   [MM/DD] (Sale|Purchase|Other…) TICKER (CALL|PUT) rest
const OPTION_NO_EXPIRY_RE = /^(?:(\d{1,2}\/\d{1,2})\s+)?(Sale|Purchase|Other(?:\s+Activity)?(?:\s+Expired\s+(?:Short|Long))?)\s+([A-Z]{1,6})\s+(CALL|PUT)\s*(.*)/i;

// Stock transaction line (no CALL/PUT keyword):
//   MM/DD (Sale|Purchase) TICKER rest
const STOCK_LINE_RE = /^(\d{1,2}\/\d{1,2})\s+(Sale|Purchase)\s+([A-Z]{1,6})\s+(.*)/;

// Continuation line — strike + C/P, with optional "Activity" prefix and optional full expiry date.
// EXP token may appear BEFORE or AFTER the C|P indicator.
// Handles all observed formats:
//   "26.00 P EXP 01/16/26"                            (EXP after C/P)
//   "01/15/2027 35.00 EXP 01/15/27 C"                 (expiry first, EXP before C)
//   "Activity 01/16/2026 01/16/26 200.00 C"            (Activity prefix, no EXP)
//   "Activity 26.00 P EXP 01/16/26"                    (Activity prefix, EXP after C/P)
const CONTINUATION_RE = /^(?:Activity\s+)?(\d{2}\/\d{2}\/\d{4})?\s*(?:\d{2}\/\d{2}\/\d{2}\s*)?([\d.]+)\s+(?:EXP\s+\d{2}\/\d{2}\/\d{2}\s+)?([CP])(?:\s+EXP\s+\d{2}\/\d{2}\/\d{2})?$/i;

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

      // Flexible section detection — handles "Transaction\nDetails" split
      const startIdx = pdfText.search(/Transaction\s+Details/i);
      if (startIdx === -1) {
        errors.push('Could not find Transaction Details section in PDF');
        return { success: false, transactions: [], optionTransactions: [], accountInfo, errors, warnings };
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
          const expiryRaw = withExpiry[4]; // MM/DD/YYYY
          const callPut = withExpiry[5].toUpperCase() as 'CALL' | 'PUT';
          const rest = withExpiry[6];
          i++;

          const { nums } = this.extractTrailingNumbers(rest);

          // Read continuation line(s) for strike + type
          let strike: number | null = null;
          let optionType: 'call' | 'put' = callPut === 'CALL' ? 'call' : 'put';

          while (i < lines.length) {
            const contLine = lines[i];
            if (/^Commission/i.test(contLine)) { i++; continue; }
            const contMatch = CONTINUATION_RE.exec(contLine);
            if (contMatch) {
              strike = parseFloat(contMatch[2]);
              optionType = contMatch[3].toUpperCase() === 'C' ? 'call' : 'put';
              i++;
            }
            break; // stop after first valid continuation (or non-matching line)
          }

          if (strike === null) {
            strike = this.extractStrikeFromDesc(rest);
          }

          const optionAction = this.mapOptionAction(actionStr);
          const { qty, premiumPerShare, fees } = this.extractOptionNums(nums);
          const [em, ed, ey] = expiryRaw.split('/');
          const expirationDate = `${ey}-${em}-${ed}`;

          if (qty > 0 && strike !== null) {
            optionTransactions.push({
              date: this.parseDate(`${date}/${year}`),
              ticker,
              optionType,
              action: optionAction,
              contracts: qty,
              strikePrice: strike,
              premiumPerShare,
              expirationDate,
              fees,
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

          // Look ahead for expiry + strike + type on continuation line(s)
          let strike: number | null = null;
          let optionType: 'call' | 'put' = callPut === 'CALL' ? 'call' : 'put';
          let expiryRaw: string | null = null;

          while (i < lines.length) {
            const contLine = lines[i];
            if (/^Commission/i.test(contLine)) { i++; continue; }

            // Pattern: [Activity] MM/DD/YYYY [MM/DD/YY] N.NN C|P
            const contMatch = CONTINUATION_RE.exec(contLine);
            if (contMatch) {
              if (contMatch[1]) expiryRaw = contMatch[1];
              strike = parseFloat(contMatch[2]);
              optionType = contMatch[3].toUpperCase() === 'C' ? 'call' : 'put';
              i++;
              break;
            }
            break;
          }

          if (strike === null) strike = this.extractStrikeFromDesc(rest);
          if (expiryRaw === null) {
            warnings.push(`No expiry date found for option: ${line}`);
            continue;
          }

          const optionAction = this.mapOptionAction(actionStr);
          const { qty, premiumPerShare, fees } = this.extractOptionNums(nums);
          const [em, ed, ey] = expiryRaw.split('/');
          const expirationDate = `${ey}-${em}-${ed}`;

          // Skip commission line if present
          if (i < lines.length && /^Commission/i.test(lines[i])) i++;

          if (qty > 0 && strike !== null) {
            optionTransactions.push({
              date: this.parseDate(`${date}/${year}`),
              ticker,
              optionType,
              action: optionAction,
              contracts: qty,
              strikePrice: strike,
              premiumPerShare,
              expirationDate,
              fees,
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

          // Skip continuation lines for this stock row
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
        warnings.push('No transactions found in the statement');
      }

      return {
        success: transactions.length > 0 || optionTransactions.length > 0,
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

  /** Map the action/category string to an option action */
  private mapOptionAction(actionStr: string): 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close' {
    if (/Expired\s+Short/i.test(actionStr)) return 'buy-to-close';
    if (/Expired\s+Long/i.test(actionStr)) return 'sell-to-close';
    if (/^Sale/i.test(actionStr)) return 'sell-to-open';
    return 'buy-to-open';
  }

  private expiredNote(actionStr: string): string {
    if (/Expired\s+Short/i.test(actionStr)) return ' (expired short)';
    if (/Expired\s+Long/i.test(actionStr)) return ' (expired long)';
    return '';
  }

  /** Extract qty, premiumPerShare, fees from trailing numeric columns */
  private extractOptionNums(nums: number[]): { qty: number; premiumPerShare: number; fees: number } {
    // nums layout depends on transaction type:
    // sell-to-open / buy-to-open: [qty, price, fees, amount]  → 4 nums
    // expired: [qty]                                           → 1 num
    return {
      qty: nums.length >= 1 ? Math.abs(nums[0]) : 0,
      premiumPerShare: nums.length >= 2 ? nums[1] : 0,
      fees: nums.length >= 3 ? nums[2] : 0
    };
  }

  /**
   * Peels trailing numeric columns off a string right-to-left.
   * Handles plain numbers (1.3300) and parenthesized negatives ((825.66)).
   */
  private extractTrailingNumbers(str: string): { nums: number[]; desc: string } {
    const nums: number[] = [];
    let rest = str.trimEnd();
    const re = /\s+(\([\d,]+\.?\d*\)|[\d,]+\.?\d*)$/;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
      const raw = m[1];
      const val = parseFloat(raw.replace(/[(),]/g, '').replace(/,/g, ''));
      if (isNaN(val)) break;
      nums.unshift(val);
      rest = rest.slice(0, rest.length - m[0].length);
    }
    return { nums, desc: rest.trim() };
  }

  /** Extract strike price from description, e.g. "$26" → 26 */
  private extractStrikeFromDesc(desc: string): number | null {
    const m = desc.match(/\$(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  /** Extract 4-digit year from statement period header */
  private extractYear(pdfText: string): string {
    const m = pdfText.match(
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+-\d+,\s+(\d{4})/i
    );
    return m ? m[1] : new Date().getFullYear().toString();
  }

  /** Convert MM/DD/YYYY to YYYY-MM-DD */
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
