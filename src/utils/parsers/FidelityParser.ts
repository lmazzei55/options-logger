import type { BrokerParser, ImportResult, ParsedTransaction, ParsedOptionTransaction, AccountInfo } from './BrokerParser';

export class FidelityParser implements BrokerParser {
  name = 'Fidelity';
  id = 'fidelity';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract account information
      const accountInfo = this.extractAccountInfo(pdfText);

      // Build ticker map from Holdings section
      const tickerMap = this.buildTickerMap(pdfText);

      // Extract year from statement period
      const yearMatch = pdfText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+-\d+,\s+(\d{4})/);
      const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

      // Find Transaction Details section
      const txnSectionMatch = pdfText.match(/Transaction Details[\s\S]*?(?=Total Transactions|Account Summary|$)/);
      
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
        
        // Look for date line: "01/13" or "01/13/2025"
        const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/);
        if (!dateMatch) {
          i++;
          continue;
        }
        
        const date = dateMatch[1];
        i++;
        
        // Next line should be action type
        if (i >= lines.length) break;
        const actionLine = lines[i];
        
        // Check for various action types
        const isBuy = /^(Bought|Purchase|Buy|You Bought)$/i.test(actionLine);
        const isSell = /^(Sold|Sale|Sell|You Sold)$/i.test(actionLine);
        
        if (!isBuy && !isSell) {
          i++;
          continue;
        }
        
        const category = isBuy ? 'Purchase' : 'Sale';
        i++;
        
        // Parse all transactions for this date/action
        while (i < lines.length) {
          // Check if we've hit the next date line
          if (/^\d{1,2}\/\d{1,2}(?:\/\d{4})?/.test(lines[i])) {
            break;
          }
          
          // Check if this is a new action line
          if (/^(Bought|Purchase|Buy|You Bought|Sold|Sale|Sell|You Sold)$/i.test(lines[i])) {
            break;
          }
          
          // Try to parse as ticker or company name
          const tickerOrCompany = lines[i];
          let ticker: string;
          
          // First, try to map as company name (even if it looks like a ticker)
          const mappedTicker = this.findTickerFromCompanyName(tickerOrCompany, tickerMap);
          if (mappedTicker) {
            ticker = mappedTicker;
            i++;
          } else {
            // Check if this is a ticker (2-5 uppercase letters, may include periods)
            const tickerMatch = tickerOrCompany.match(/^([A-Z]{2,5}(?:\.[A-Z])?)$/);
            if (tickerMatch) {
              ticker = tickerMatch[1];
              i++;
            } else {
              // Skip this line if we can't identify it
              i++;
              continue;
            }
          }
          
          // Try to parse as option transaction first
          const option = this.parseOptionTransaction(lines, i, ticker, date, category, year);
          if (option) {
            optionTransactions.push(option.transaction);
            i = option.nextIndex;
          } else {
            // Try to parse as stock transaction
            const stock = this.parseStockTransaction(lines, i, ticker, date, category, year);
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

  private buildTickerMap(pdfText: string): Map<string, string> {
    const tickerMap = new Map<string, string>();
    
    // Look for Holdings section
    const holdingsMatch = pdfText.match(/Holdings[\s\S]*?(?=Transaction Details|Account Summary|$)/);
    if (!holdingsMatch) return tickerMap;
    
    const holdingsSection = holdingsMatch[0];
    const lines = holdingsSection.split('\n');
    
    // Look for patterns like "APPLE INC (AAPL)" or "Apple Inc. (AAPL)"
    for (const line of lines) {
      const match = line.match(/(.+?)\s*\(([A-Z]{2,5})\)/);
      if (match) {
        const companyName = match[1].trim().toUpperCase();
        const ticker = match[2];
        tickerMap.set(companyName, ticker);
      }
    }
    
    return tickerMap;
  }

  private findTickerFromCompanyName(companyName: string, tickerMap: Map<string, string>): string | null {
    const normalized = companyName.toUpperCase().trim();
    
    // Direct match
    if (tickerMap.has(normalized)) {
      return tickerMap.get(normalized)!;
    }
    
    // Try partial matches - prefer longer matches
    let bestMatch: string | null = null;
    let bestMatchLength = 0;
    
    for (const [name, ticker] of tickerMap.entries()) {
      // Check if the company name contains the search term or vice versa
      if (name.includes(normalized)) {
        if (name.length > bestMatchLength) {
          bestMatch = ticker;
          bestMatchLength = name.length;
        }
      } else if (normalized.includes(name)) {
        if (name.length > bestMatchLength) {
          bestMatch = ticker;
          bestMatchLength = name.length;
        }
      }
    }
    
    return bestMatch;
  }

  private parseOptionTransaction(
    lines: string[],
    startIndex: number,
    ticker: string,
    date: string,
    category: string,
    year: string
  ): { transaction: ParsedOptionTransaction; nextIndex: number } | null {
    // Expected structure for options:
    // - Option description (e.g., "CALL 100.00 01/15/2026" or "PUT $50 03/20/26")
    // - Quantity (e.g., "10" or "10.0000")
    // - Price (e.g., "$1.50" or "1.50")
    // - Amount (e.g., "$1,500.00")
    
    let i = startIndex;
    
    // Check if next line looks like an option description
    if (i >= lines.length) return null;
    const descLine = lines[i];
    
    // Look for CALL or PUT
    const optionMatch = descLine.match(/\b(CALL|PUT)\b/i);
    if (!optionMatch) return null;
    
    const optionType: 'call' | 'put' = optionMatch[1].toLowerCase() as 'call' | 'put';
    i++;
    
    // Extract strike price and expiration from description or subsequent lines
    let strikePrice: number | null = null;
    let expirationDate: string | null = null;
    
    // Try to find strike price in description line
    const strikeMatch = descLine.match(/\$?([\d.]+)/);
    if (strikeMatch) {
      strikePrice = parseFloat(strikeMatch[1]);
    }
    
    // Try to find expiration date in description line
    const expMatch = descLine.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (expMatch) {
      const expYear = expMatch[3].length === 2 ? `20${expMatch[3]}` : expMatch[3];
      expirationDate = `${expYear}-${expMatch[1].padStart(2, '0')}-${expMatch[2].padStart(2, '0')}`;
    }
    
    // If we didn't find strike or expiration in description, look in next lines
    if (!strikePrice || !expirationDate) {
      // Check next few lines for strike and expiration
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        if (!strikePrice) {
          const strikeLine = lines[j].match(/Strike[:\s]*\$?([\d.]+)/i);
          if (strikeLine) {
            strikePrice = parseFloat(strikeLine[1]);
            i = j + 1; // Move index past the strike line
            continue;
          }
        }
        
        if (!expirationDate) {
          const expLine = lines[j].match(/(?:Exp|Expiration)[:\s]*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
          if (expLine) {
            const expYear = expLine[3].length === 2 ? `20${expLine[3]}` : expLine[3];
            expirationDate = `${expYear}-${expLine[1].padStart(2, '0')}-${expLine[2].padStart(2, '0')}`;
            i = j + 1; // Move index past the expiration line
            continue;
          }
        }
      }
    }
    
    // If we still don't have strike or expiration, this might not be a valid option
    if (!strikePrice || !expirationDate) return null;
    
    // Parse quantity
    if (i >= lines.length) return null;
    const quantityLine = lines[i];
    const quantityMatch = quantityLine.match(/^([\d,.]+)$/);
    if (!quantityMatch) return null;
    const contracts = parseFloat(quantityMatch[1].replace(/,/g, ''));
    i++;
    
    // Parse price per share (premium)
    if (i >= lines.length) return null;
    const priceLine = lines[i];
    const priceMatch = priceLine.match(/\$?([\d,.]+)/);
    if (!priceMatch) return null;
    const premiumPerShare = parseFloat(priceMatch[1].replace(/,/g, ''));
    i++;
    
    // Skip amount line
    if (i < lines.length && /^[\$\d,.-]+$/.test(lines[i])) {
      i++;
    }
    
    // Check for fees
    let fees = 0;
    if (i < lines.length && /Fees?|Commission/i.test(lines[i])) {
      i++;
      if (i < lines.length) {
        const feesMatch = lines[i].match(/\$?([\d,.]+)/);
        if (feesMatch) {
          fees = parseFloat(feesMatch[1].replace(/,/g, ''));
          i++;
        }
      }
    }
    
    // Determine action type
    let optionAction: 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close';
    
    // Check for closing transaction indicators
    const nextLines = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
    const hasClosing = /Closing|Close|Realized|Gain\/\(Loss\)/i.test(nextLines);
    
    if (category === 'Sale' && hasClosing) {
      optionAction = 'sell-to-close';
    } else if (category === 'Purchase' && hasClosing) {
      optionAction = 'buy-to-close';
    } else if (category === 'Sale') {
      optionAction = 'sell-to-open';
    } else {
      optionAction = 'buy-to-open';
    }
    
    // Parse full date
    const fullDate = this.parseDate(date, year);
    
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
        notes: `Imported from Fidelity statement`
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
    year: string
  ): { transaction: ParsedTransaction; nextIndex: number } | null {
    // Expected structure for stocks:
    // - Company name (optional, may have been consumed already)
    // - Quantity (e.g., "100" or "100.0000")
    // - Price (e.g., "$150.00" or "150.00")
    // - Amount (e.g., "$15,000.00")
    
    let i = startIndex;
    
    // Skip company name if present (doesn't start with number or $)
    if (i < lines.length && !/^[\d$]/.test(lines[i])) {
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
    if (i < lines.length && /Fees?|Commission/i.test(lines[i])) {
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
    const fullDate = this.parseDate(date, year);
    
    return {
      transaction: {
        date: fullDate,
        ticker,
        action: stockAction,
        shares,
        pricePerShare,
        fees,
        notes: `Imported from Fidelity statement`
      },
      nextIndex: i
    };
  }

  private parseDate(dateStr: string, year?: string): string {
    // Handle both MM/DD and MM/DD/YYYY formats
    const parts = dateStr.split('/');
    
    if (parts.length === 2) {
      // MM/DD format - use provided year
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const fullYear = year || new Date().getFullYear().toString();
      return `${fullYear}-${month}-${day}`;
    } else if (parts.length === 3) {
      // MM/DD/YYYY format
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const fullYear = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${fullYear}-${month}-${day}`;
    }
    
    return dateStr;
  }

  private extractAccountInfo(pdfText: string): AccountInfo | undefined {
    // Try to extract account number
    // Common patterns in Fidelity statements:
    // "Account Number: Z12345678"
    // "Account #: Z12345678"
    // "Account Z12345678"
    const accountNumberMatch = pdfText.match(/Account\s+(?:Number|#)?\s*:?\s*([A-Z]?\d{4,10})/i);
    
    if (!accountNumberMatch) {
      return undefined;
    }

    const accountNumber = accountNumberMatch[1];

    // Try to extract account type
    // Patterns: "Individual Brokerage", "Retirement Account", "Margin Account"
    let accountType: 'brokerage' | 'retirement' | 'margin' | 'crypto' | undefined;
    let accountName: string | undefined;

    const accountTypeMatch = pdfText.match(/Account\s+Type\s*:?\s*(.*?)(?:\n|$)/i);
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

    // Try to extract account name/nickname
    const accountNameMatch = pdfText.match(/Account\s+Name\s*:?\s*(.*?)(?:\n|$)/i);
    if (accountNameMatch && !accountName) {
      accountName = accountNameMatch[1].trim();
    }

    return {
      accountNumber,
      broker: 'Fidelity',
      accountName,
      accountType
    };
  }
}
