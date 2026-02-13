import type { BrokerParser, ImportResult, ParsedOptionTransaction, ParsedTransaction } from './BrokerParser';

export class SchwabMonthlyParser implements BrokerParser {
  name = 'Schwab Monthly Statement';
  id = 'schwab-monthly';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract year from statement period
      const yearMatch = pdfText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+-\d+,\s+(\d{4})/);
      const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

      // Find Transaction Details section
      const txnSectionMatch = pdfText.match(/Transaction Details[\s\S]*?Total Transactions/);
      
      if (!txnSectionMatch) {
        errors.push('Could not find Transaction Details section in PDF');
        return { success: false, transactions: [], optionTransactions: [], errors, warnings };
      }

      const txnSection = txnSectionMatch[0];
      const lines = txnSection.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Parse transactions
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        
        // Look for date line: "01/13 Sale" or "01/16 Purchase"
        const dateMatch = line.match(/^(\d{1,2}\/\d{1,2})\s+(Sale|Purchase)/);
        if (!dateMatch) {
          i++;
          continue;
        }
        
        const date = dateMatch[1];
        const category = dateMatch[2];
        console.log(`Found date line: ${date} ${category}`);
        i++;
        
        // Check if next line is an action (Short Sale, Cover Short, etc.)
        let action = '';
        if (i < lines.length && (lines[i] === 'Short Sale' || lines[i] === 'Cover Short')) {
          action = lines[i];
          i++;
        }
        
        // Look for ticker on next line (should be 2-5 letter symbol)
        if (i >= lines.length) break;
        
        const tickerLine = lines[i];
        // Check if this is a ticker (standalone or with date like "SOFI 01/30/2026")
        const tickerMatch = tickerLine.match(/^([A-Z]{2,5})(?:\s|$)/);
        if (!tickerMatch) {
          // Not a valid ticker, skip this transaction
          console.log(`Skipping - no ticker found. Line: "${tickerLine}"`);
          continue;
        }
        
        const ticker = tickerMatch[1];
        console.log(`Found ticker: ${ticker}`);
        i++;
        
        // Try to parse as option transaction
        const option = this.parseOptionTransaction(lines, i, ticker, date, category, action, year);
        if (option) {
          console.log(`✓ Parsed option: ${date} ${ticker} ${option.transaction.optionType} $${option.transaction.strikePrice}`);
          optionTransactions.push(option.transaction);
          i = option.nextIndex;
        } else {
          console.log(`✗ Failed to parse option for ${ticker}`);
        }
      }

      if (transactions.length === 0 && optionTransactions.length === 0) {
        warnings.push('No transactions found in the statement');
      }

      return {
        success: transactions.length > 0 || optionTransactions.length > 0,
        transactions,
        optionTransactions,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, transactions: [], optionTransactions: [], errors, warnings };
    }
  }

  private parseOptionTransaction(
    lines: string[],
    startIndex: number,
    ticker: string,
    date: string,
    category: string,
    action: string,
    year: string
  ): { transaction: ParsedOptionTransaction; nextIndex: number } | null {
    // Expected structure after ticker:
    // - Expiration line (e.g., "03/20/2026 40.00" or "01/30/2026")
    // - C or P
    // - Description (e.g., "CALL AEHR TEST SYS" or "PUT SOFI TECHNOLOGIES IN$26")
    // - Strike (e.g., "$40")
    // - EXP line (e.g., "EXP 03/20/26")
    // - Quantity (e.g., "(10.0000)")
    // - Price (e.g., "0.8800")
    // - Charges (e.g., "6.64")
    // - Amount (e.g., "873.36")
    // - Commission line (optional)
    
    let i = startIndex;
    
    // Parse expiration date line (may contain strike price too)
    if (i >= lines.length) return null;
    const expDateLine = lines[i];
    const expDateMatch = expDateLine.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!expDateMatch) return null;
    const expirationDate = `${expDateMatch[3]}-${expDateMatch[1]}-${expDateMatch[2]}`;
    i++;
    
    // Parse C or P
    if (i >= lines.length) return null;
    const cpLine = lines[i];
    if (cpLine !== 'C' && cpLine !== 'P') return null;
    const optionType = cpLine === 'C' ? 'call' : 'put';
    i++;
    
    // Parse description (contains CALL/PUT and may contain strike)
    if (i >= lines.length) return null;
    const descLine = lines[i];
    if (!/\b(CALL|PUT)\b/.test(descLine)) return null;
    i++;
    
    // Parse strike price
    if (i >= lines.length) return null;
    const strikeLine = lines[i];
    const strikeMatch = strikeLine.match(/\$(\d+(?:\.\d+)?)/);
    if (!strikeMatch) return null;
    const strikePrice = parseFloat(strikeMatch[1]);
    i++;
    
    // Parse EXP line (skip it, we already have expiration)
    if (i >= lines.length) return null;
    if (lines[i].startsWith('EXP')) {
      i++;
    }
    
    // Parse quantity
    if (i >= lines.length) return null;
    const quantityLine = lines[i];
    const quantityMatch = quantityLine.match(/\(?([\d.]+)\)?/);
    if (!quantityMatch) return null;
    const contracts = Math.abs(parseFloat(quantityMatch[1]));
    i++;
    
    // Parse price per share
    if (i >= lines.length) return null;
    const priceLine = lines[i];
    const priceMatch = priceLine.match(/^([\d.]+)$/);
    if (!priceMatch) return null;
    const premiumPerShare = parseFloat(priceMatch[1]);
    i++;
    
    // Parse charges/fees
    if (i >= lines.length) return null;
    const chargesLine = lines[i];
    const chargesMatch = chargesLine.match(/^([\d.]+)$/);
    const fees = chargesMatch ? parseFloat(chargesMatch[1]) : 0;
    i++;
    
    // Skip amount line
    if (i < lines.length && /^[\d,.-]+$/.test(lines[i].replace(/[()]/g, ''))) {
      i++;
    }
    
    // Skip commission line if present
    if (i < lines.length && lines[i].includes('Commission')) {
      i++;
    }
    
    // Determine action type
    let optionAction: 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close';
    
    // Check for realized gain/loss in next few lines
    const nextLines = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
    const hasRealizedGL = /Realized|Gain\/\(Loss\)/.test(nextLines);
    
    if (category === 'Sale' && action === 'Short Sale') {
      optionAction = 'sell-to-open';
    } else if (category === 'Purchase' && action === 'Cover Short') {
      optionAction = 'buy-to-close';
    } else if (category === 'Purchase' && hasRealizedGL) {
      optionAction = 'buy-to-close';
    } else if (category === 'Sale' && hasRealizedGL) {
      optionAction = 'sell-to-close';
    } else if (category === 'Sale') {
      optionAction = 'sell-to-open';
    } else {
      optionAction = 'buy-to-open';
    }
    
    // Parse full date
    const fullDate = this.parseDate(`${date}/${year}`);
    
    return {
      transaction: {
        date: fullDate,
        ticker,
        optionType,
        action: optionAction,
        contracts,
        strikePrice,
        premiumPerShare,
        expirationDate,
        fees,
        notes: `Imported from Schwab monthly statement`
      },
      nextIndex: i
    };
  }

  private parseDate(dateStr: string): string {
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    
    return `${year}-${month}-${day}`;
  }
}
