import type { BrokerParser, ImportResult, ParsedTransaction, ParsedOptionTransaction, AccountInfo } from './BrokerParser';

export class SchwabMonthlyParser implements BrokerParser {
  name = 'Schwab Monthly Statement';
  id = 'schwab-monthly';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract account information
      const accountInfo = this.extractAccountInfo(pdfText);

      // Extract year from statement period
      const yearMatch = pdfText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+-\d+,\s+(\d{4})/);
      const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

      // Find Transaction Details section
      const txnSectionMatch = pdfText.match(/Transaction Details[\s\S]*?Total Transactions/);
      
      if (!txnSectionMatch) {
        errors.push('Could not find Transaction Details section in PDF');
        return { success: false, transactions: [], optionTransactions: [], accountInfo, errors, warnings };
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
        i++;
        
        // Check if next line is an action (Short Sale, Cover Short, etc.)
        let action = '';
        if (i < lines.length && (lines[i] === 'Short Sale' || lines[i] === 'Cover Short')) {
          action = lines[i];
          i++;
        }
        
        // Parse all transactions for this date
        // Keep looking for tickers until we hit another date line or run out of lines
        let currentCategory = category;
        let currentAction = action;
        
        while (i < lines.length) {
          // Check if we've hit the next date line
          if (/^\d{1,2}\/\d{1,2}\s+(Sale|Purchase)/.test(lines[i])) {
            break; // Exit inner loop, will be picked up by outer loop
          }
          
          // Check if this line is a category change (Sale/Purchase without date)
          if (lines[i] === 'Sale' || lines[i] === 'Purchase') {
            currentCategory = lines[i];
            i++;
            
            // Check if next line is an action
            if (i < lines.length && (lines[i] === 'Short Sale' || lines[i] === 'Cover Short')) {
              currentAction = lines[i];
              i++;
            } else {
              currentAction = '';
            }
            continue;
          }
          
          const tickerLine = lines[i];
          // Check if this is a ticker (standalone or with date like "SOFI 01/30/2026")
          const tickerMatch = tickerLine.match(/^([A-Z]{2,5})(?:\s|$)/);
          if (!tickerMatch) {
            // Not a ticker, move to next line
            i++;
            continue;
          }
          
          const ticker = tickerMatch[1];
          
          // Check if ticker line contains expiration date (SOFI format)
          const tickerExpMatch = tickerLine.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          const tickerExpiration = tickerExpMatch ? `${tickerExpMatch[3]}-${tickerExpMatch[1]}-${tickerExpMatch[2]}` : null;
          if (tickerExpiration) {
          }
          
          i++;
          
          // Try to parse as option transaction first
          const option = this.parseOptionTransaction(lines, i, ticker, date, currentCategory, currentAction, year, tickerExpiration);
          if (option) {
            optionTransactions.push(option.transaction);
            i = option.nextIndex;
          } else {
            // Try to parse as stock transaction
            const stock = this.parseStockTransaction(lines, i, ticker, date, currentCategory, currentAction, year);
            if (stock) {
              transactions.push(stock.transaction);
              i = stock.nextIndex;
            } else {
              // If both parsing attempts failed, skip this ticker
              i++;
            }
          }
        }
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

  private parseOptionTransaction(
    lines: string[],
    startIndex: number,
    ticker: string,
    date: string,
    category: string,
    action: string,
    year: string,
    tickerExpiration: string | null = null
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
    
    
    let expirationDate: string;
    
    // If expiration was in ticker line (SOFI format), use it
    if (tickerExpiration) {
      expirationDate = tickerExpiration;
    } else {
      // Parse expiration date line (AEHR format: "03/20/2026 40.00")
      if (i >= lines.length) {
        return null;
      }
      const expDateLine = lines[i];
      const expDateMatch = expDateLine.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!expDateMatch) {
        return null;
      }
      expirationDate = `${expDateMatch[3]}-${expDateMatch[1]}-${expDateMatch[2]}`;
      i++;
    }
    
    // Parse C or P (may be standalone or combined with strike like "26.00 P")
    if (i >= lines.length) {
      return null;
    }
    const cpLine = lines[i];
    
    let optionType: 'call' | 'put';
    let strikeFromCPLine: number | null = null;
    
    if (cpLine === 'C' || cpLine === 'P') {
      // AEHR format: standalone C or P
      optionType = cpLine === 'C' ? 'call' : 'put';
      i++;
    } else if (/^[\d.]+\s+[CP]$/.test(cpLine)) {
      // SOFI format: "26.00 P" or "26.00 C"
      const match = cpLine.match(/^([\d.]+)\s+([CP])$/);
      if (match) {
        strikeFromCPLine = parseFloat(match[1]);
        optionType = match[2] === 'C' ? 'call' : 'put';
        i++;
      } else {
        return null;
      }
    } else {
      return null;
    }
    
    // Parse description (contains CALL/PUT and may contain strike)
    if (i >= lines.length) return null;
    const descLine = lines[i];
    if (!/\b(CALL|PUT)\b/.test(descLine)) return null;
    i++;
    
    // Parse strike price (may already have it from combined C/P line)
    let strikePrice: number;
    if (strikeFromCPLine !== null) {
      strikePrice = strikeFromCPLine;
    } else {
      if (i >= lines.length) return null;
      const strikeLine = lines[i];
      const strikeMatch = strikeLine.match(/\$(\d+(?:\.\d+)?)/);
      if (!strikeMatch) return null;
      strikePrice = parseFloat(strikeMatch[1]);
      i++;
    }
    
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

  private parseStockTransaction(
    lines: string[],
    startIndex: number,
    ticker: string,
    date: string,
    category: string,
    action: string,
    year: string
  ): { transaction: ParsedTransaction; nextIndex: number } | null {
    // Expected structure after ticker:
    // - Company name (e.g., "Apple Inc." or "APPLE INC")
    // - Quantity (e.g., "100" or "100.0000")
    // - Price (e.g., "$150.00" or "150.00")
    // - Amount (e.g., "$15,000.00" or "15000.00")
    // - Optional: Fees line
    
    let i = startIndex;
    
    // Skip company name line (may be multiple words)
    if (i >= lines.length) return null;
    // Company name typically doesn't start with a number or $
    if (!/^[\d$]/.test(lines[i])) {
      i++;
    }
    
    // Parse quantity
    if (i >= lines.length) return null;
    const quantityLine = lines[i];
    const quantityMatch = quantityLine.match(/^([\d,.]+)$/);
    if (!quantityMatch) return null;
    const shares = parseFloat(quantityMatch[1].replace(/,/g, ''));
    i++;
    
    // Parse price per share
    if (i >= lines.length) return null;
    const priceLine = lines[i];
    const priceMatch = priceLine.match(/\$?([\d,.]+)/);
    if (!priceMatch) return null;
    const pricePerShare = parseFloat(priceMatch[1].replace(/,/g, ''));
    i++;
    
    // Parse total amount
    if (i >= lines.length) return null;
    const amountLine = lines[i];
    const amountMatch = amountLine.match(/\$?([\d,.]+)/);
    if (!amountMatch) return null;
    const totalAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    i++;
    
    // Check for fees
    let fees = 0;
    if (i < lines.length && /Fees?\s*&?\s*Commissions?/.test(lines[i])) {
      i++;
      if (i < lines.length) {
        const feesMatch = lines[i].match(/\$?([\d,.]+)/);
        if (feesMatch) {
          fees = parseFloat(feesMatch[1].replace(/,/g, ''));
          i++;
        }
      }
    }
    
    // Determine action
    const stockAction: 'buy' | 'sell' = category === 'Purchase' ? 'buy' : 'sell';
    
    // Parse full date
    const fullDate = this.parseDate(`${date}/${year}`);
    
    return {
      transaction: {
        date: fullDate,
        ticker,
        action: stockAction,
        shares,
        pricePerShare,
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

  private extractAccountInfo(pdfText: string): AccountInfo | undefined {
    // Try to extract account number
    // Common patterns in Schwab statements:
    // "Account Number ****1234"
    // "Account #: 12345678"
    // "Acct: 1234-5678"
    const accountNumberMatch = pdfText.match(/Account\s+(?:Number|#|Acct)?\s*:?\s*[*]*(\d{4,10})/i);
    
    if (!accountNumberMatch) {
      return undefined;
    }

    const accountNumber = accountNumberMatch[1];

    // Try to extract account type
    // Patterns: "Account Type: Individual", "Type: Margin"
    let accountType: 'brokerage' | 'retirement' | 'margin' | 'crypto' | undefined;
    let accountName: string | undefined;

    const accountTypeMatch = pdfText.match(/(?:Account\s+)?Type\s*:?\s*(.*?)(?:\n|$)/i);
    if (accountTypeMatch) {
      const typeText = accountTypeMatch[1].toLowerCase();
      if (typeText.includes('retirement') || typeText.includes('ira') || typeText.includes('401k')) {
        accountType = 'retirement';
      } else if (typeText.includes('margin')) {
        accountType = 'margin';
      } else if (typeText.includes('brokerage') || typeText.includes('individual')) {
        accountType = 'brokerage';
      }
      accountName = accountTypeMatch[1].trim();
    }

    return {
      accountNumber,
      broker: 'Schwab',
      accountName,
      accountType
    };
  }
}
