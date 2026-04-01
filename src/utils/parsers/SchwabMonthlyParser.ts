import type { BrokerParser, ImportResult, ParsedTransaction, ParsedOptionTransaction, AccountInfo } from './BrokerParser';

/**
 * Parses Schwab monthly brokerage statements.
 *
 * Real Schwab PDFs (after pdfjs Y-sorted text extraction) produce one concatenated
 * line per visual table row, e.g.:
 *   01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67
 *   26.00 P EXP 01/16/26
 *   Commission $1.30; Industry Fee $0.03
 *
 * Option line format:
 *   [MM/DD] (Sale|Purchase|Other Activity [Expired Short|Long]) TICKER MM/DD/YYYY (CALL|PUT) <desc> [qty] [price] [fees] [amount]
 *
 * Stock line format:
 *   MM/DD (Sale|Purchase) TICKER <company> qty price [fees] amount
 *
 * Continuation line (strike + type): e.g. "26.00 P EXP 01/16/26" or "35.00 C"
 */

// Option transaction: must have expiry date MM/DD/YYYY after ticker, plus CALL|PUT
const OPTION_LINE_RE = /^(?:(\d{1,2}\/\d{1,2})\s+)?(Sale|Purchase|Other\s+Activity(?:\s+Expired\s+(?:Short|Long))?)\s+([A-Z]{1,5})\s+(\d{2}\/\d{2}\/\d{4})\s+(CALL|PUT)\s+(.*)/i;

// Stock transaction: has date + action + ticker, but NOT followed by expiry date
const STOCK_LINE_RE = /^(\d{1,2}\/\d{1,2})\s+(Sale|Purchase)\s+([A-Z]{1,5})(?!\s+\d{2}\/\d{2}\/\d{4})\s*(.*)/;

// Continuation line: strike price + C|P, optionally followed by EXP date
const CONTINUATION_RE = /^([\d.]+)\s+([CP])(?:\s+EXP\s+\d{2}\/\d{2}\/\d{2})?$/i;

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

      // Flexible section detection — handles "Transaction\nDetails" split across pdfjs items
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

        // --- Try option transaction ---
        const optMatch = OPTION_LINE_RE.exec(line);
        if (optMatch) {
          if (optMatch[1]) currentDate = optMatch[1];
          const date = currentDate ?? '01/01';
          const actionStr = optMatch[2].trim();
          const ticker = optMatch[3];
          const expiryRaw = optMatch[4]; // MM/DD/YYYY
          const callPut = optMatch[5].toUpperCase() as 'CALL' | 'PUT';
          const rest = optMatch[6];
          i++;

          // Extract numeric columns from end of rest: [qty, price, fees, amount] or [qty]
          const { nums, desc } = this.extractTrailingNumbers(rest);

          // Strike and type: prefer continuation line, fall back to $N in description
          let strike: number | null = null;
          let optionType: 'call' | 'put' = callPut === 'CALL' ? 'call' : 'put';

          if (i < lines.length && CONTINUATION_RE.test(lines[i])) {
            const contMatch = CONTINUATION_RE.exec(lines[i])!;
            strike = parseFloat(contMatch[1]);
            optionType = contMatch[2].toUpperCase() === 'C' ? 'call' : 'put';
            i++;
          }
          if (strike === null) {
            strike = this.extractStrikeFromDesc(desc);
          }

          // Skip commission/fee detail line
          if (i < lines.length && /Commission/i.test(lines[i])) {
            i++;
          }

          // Map action string to option action
          const isExpiredShort = /Expired\s+Short/i.test(actionStr);
          const isExpiredLong = /Expired\s+Long/i.test(actionStr);
          let optionAction: 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close';
          let notesSuffix = '';
          if (isExpiredShort) {
            optionAction = 'buy-to-close';
            notesSuffix = ' (expired short)';
          } else if (isExpiredLong) {
            optionAction = 'sell-to-close';
            notesSuffix = ' (expired long)';
          } else if (/^Sale/i.test(actionStr)) {
            optionAction = 'sell-to-open';
          } else {
            optionAction = 'buy-to-open';
          }

          // nums layout: 4 = [qty, price, fees, amount], 1 = [qty] (expired at $0)
          const qty = nums.length >= 1 ? Math.abs(nums[0]) : 0;
          const premiumPerShare = nums.length >= 2 ? nums[1] : 0;
          const fees = nums.length >= 3 ? nums[2] : 0;

          // Parse expiry date MM/DD/YYYY → YYYY-MM-DD
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
              notes: `Imported from Schwab monthly statement${notesSuffix}`
            });
          } else {
            warnings.push(`Skipped option line (missing strike or qty=0): ${line}`);
          }
          continue;
        }

        // --- Try stock transaction ---
        const stockMatch = STOCK_LINE_RE.exec(line);
        if (stockMatch) {
          currentDate = stockMatch[1];
          const category = stockMatch[2];
          const ticker = stockMatch[3];
          const rest = stockMatch[4];
          i++;

          const { nums } = this.extractTrailingNumbers(rest);

          // Skip any continuation/detail lines belonging to this stock entry
          while (
            i < lines.length &&
            !OPTION_LINE_RE.test(lines[i]) &&
            !STOCK_LINE_RE.test(lines[i])
          ) {
            i++;
          }

          // Need at least qty + price
          if (nums.length >= 2) {
            const shares = Math.abs(nums[0]);
            const pricePerShare = nums[1];
            const fees = nums.length >= 4 ? nums[2] : 0;
            transactions.push({
              date: this.parseDate(`${currentDate}/${year}`),
              ticker,
              action: /^Sale/i.test(category) ? 'sell' : 'buy',
              shares,
              pricePerShare,
              fees,
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

  /**
   * Extracts numeric columns from the end of a string (right to left).
   * Numbers may be plain (e.g. "8.2500") or negative in parens (e.g. "(825.66)").
   * Stops when a non-numeric token is encountered (dates with slashes are safe stops).
   */
  private extractTrailingNumbers(str: string): { nums: number[]; negs: boolean[]; desc: string } {
    const nums: number[] = [];
    const negs: boolean[] = [];
    let rest = str.trimEnd();

    // Match: whitespace + (optional parens wrapping digits/commas/dot)
    const re = /\s+(\([\d,]+\.?\d*\)|[\d,]+\.?\d*)$/;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
      const raw = m[1];
      const neg = raw.startsWith('(');
      const val = parseFloat(raw.replace(/[(),]/g, '').replace(/,/g, ''));
      if (isNaN(val)) break;
      nums.unshift(val);
      negs.unshift(neg);
      rest = rest.slice(0, rest.length - m[0].length);
    }

    return { nums, negs, desc: rest.trim() };
  }

  /** Extract strike price from description, e.g. "$26" → 26, "$200" → 200 */
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
    // Schwab account numbers: XXXX-X554, ****-1234, 12345678, etc.
    const accountMatch =
      pdfText.match(/Account\s+(?:Number|#|Acct)?\s*:?\s*[*X]*([\dX*-]{4,20})/i) ??
      pdfText.match(/([\dX*]{3,6}-[\dX*]{3,6})/);

    if (!accountMatch) return undefined;

    const accountNumber = accountMatch[1];

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

    return { accountNumber, broker: 'Schwab', accountType };
  }
}
