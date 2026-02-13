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

      // Parse transactions by date blocks
      let currentDate = '';
      let currentCategory = '';
      let currentAction = '';
      let pendingDate = '';
      let pendingCategory = '';
      let pendingAction = '';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for date line
        const dateMatch = line.match(/^(\d{1,2}\/\d{1,2})\s+(Sale|Purchase)/);
        if (dateMatch) {
          // If we have a pending date and encounter a new date:
          // - The pending date had no immediate data
          // - Set current to the NEW date (not pending)
          // - Keep pending for potential use if first ticker belongs to it
          if (pendingDate) {
            // Don't clear pending yet - we'll use it when we find the first ticker
            currentDate = dateMatch[1];
            currentCategory = dateMatch[2];
            currentAction = '';
            
            // Check next line for action
            if (i + 1 < lines.length && (lines[i + 1] === 'Short Sale' || lines[i + 1] === 'Cover Short')) {
              currentAction = lines[i + 1];
              i++; // Skip action line
            }
          } else {
            currentDate = dateMatch[1];
            currentCategory = dateMatch[2];
            currentAction = '';
            
            // Check next line for action
            if (i + 1 < lines.length && (lines[i + 1] === 'Short Sale' || lines[i + 1] === 'Cover Short')) {
              currentAction = lines[i + 1];
              i++; // Skip action line
            }
            
            // Mark this as pending in case next line is another date
            pendingDate = currentDate;
            pendingCategory = currentCategory;
            pendingAction = currentAction;
          }
          continue;
        }
        
        // Look for option transaction start
        // Pattern 1: Standalone ticker (AEHR) - next line has CALL/PUT
        // Pattern 2: Ticker with full info on one line (SOFI 01/30/2026 PUT...)
        const isStandaloneTicker = /^[A-Z]{2,5}$/.test(line) && line !== 'CUSIP' && line !== 'Symbol' && line !== 'Description' && line !== 'Action';
        const tickerWithInfo = line.match(/^([A-Z]{2,5})\s+\d{2}\/\d{2}\/\d{4}\s+(CALL|PUT)/);
        
        // If we find a ticker:
        // - If pending date exists and differs from current, first ticker uses pending
        // - Clear pending after first use
        if ((isStandaloneTicker || tickerWithInfo) && pendingDate && pendingDate !== currentDate) {
          // Use pending date for this ticker
          const usePendingDate = pendingDate;
          const usePendingCategory = pendingCategory;
          const usePendingAction = pendingAction;
          
          // Clear pending
          pendingDate = '';
          pendingCategory = '';
          pendingAction = '';
          
          // Process with pending date
          if (isStandaloneTicker) {
            if (i + 1 >= lines.length) continue;
            const descLine = lines[i + 1];
            if (!/\b(CALL|PUT)\b/.test(descLine)) continue;
            
            try {
              const option = this.extractOptionFromBlock(lines, i, usePendingDate, usePendingCategory, usePendingAction, year, 'standard');
              if (option) {
                optionTransactions.push(option);
              }
            } catch (error) {
              warnings.push(`Failed to parse option at line ${i}: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else if (tickerWithInfo) {
            try {
              const option = this.extractOptionFromBlock(lines, i, usePendingDate, usePendingCategory, usePendingAction, year, 'compact');
              if (option) {
                optionTransactions.push(option);
              }
            } catch (error) {
              warnings.push(`Failed to parse option at line ${i}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          continue;
        }
        
        // Clear pending if we've found a ticker
        if (isStandaloneTicker || tickerWithInfo) {
          pendingDate = '';
          pendingCategory = '';
          pendingAction = '';
        }
        
        if (isStandaloneTicker) {
          // Verify next line has CALL or PUT
          if (i + 1 >= lines.length) continue;
          const descLine = lines[i + 1];
          if (!/\b(CALL|PUT)\b/.test(descLine)) continue;
          
          // Extract option data using standard format
          try {
            const option = this.extractOptionFromBlock(lines, i, currentDate, currentCategory, currentAction, year, 'standard');
            if (option) {
              optionTransactions.push(option);
            }
          } catch (error) {
            warnings.push(`Failed to parse option at line ${i}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else if (tickerWithInfo) {
          // Extract option data using compact format
          try {
            const option = this.extractOptionFromBlock(lines, i, currentDate, currentCategory, currentAction, year, 'compact');
            if (option) {
              optionTransactions.push(option);
            }
          } catch (error) {
            warnings.push(`Failed to parse option at line ${i}: ${error instanceof Error ? error.message : String(error)}`);
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
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, transactions: [], optionTransactions: [], errors, warnings };
    }
  }

  private extractOptionFromBlock(
    lines: string[],
    startIndex: number,
    date: string,
    category: string,
    action: string,
    year: string,
    format: 'standard' | 'compact'
  ): ParsedOptionTransaction | null {
    if (format === 'standard') {
      // Standard format (AEHR):
      // 0: Ticker (e.g., "AEHR")
      // 1: Description (e.g., "CALL AEHR TEST SYS")
      // 2: Strike (e.g., "$40")
      // 3: Expiration (e.g., "03/20/2026 40.00 EXP 03/20/26")
      // 4: C or P
      // 5: Commission line
      // 6: Quantity (e.g., "(10.0000)")
      // 7: Price per share (e.g., "0.8800")
      // 8: Charges (e.g., "6.64")
      // 9: Amount (e.g., "873.36")
      
      if (startIndex + 9 >= lines.length) return null;
      
      const ticker = lines[startIndex];
      
      const descLine = lines[startIndex + 1];
      const typeMatch = descLine.match(/\b(CALL|PUT)\b/);
      if (!typeMatch) return null;
      const optionType = typeMatch[1].toLowerCase() as 'call' | 'put';
      
      const strikeLine = lines[startIndex + 2];
      const strikeMatch = strikeLine.match(/\$(\d+(?:\.\d+)?)/);
      if (!strikeMatch) return null;
      const strikePrice = parseFloat(strikeMatch[1]);
      
      const expLine = lines[startIndex + 3];
      const expMatch = expLine.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!expMatch) return null;
      const expirationDate = `${expMatch[3]}-${expMatch[1]}-${expMatch[2]}`;
      
      const quantityLine = lines[startIndex + 6];
      const quantityMatch = quantityLine.match(/\(?(\d+\.\d+)\)?/);
      if (!quantityMatch) return null;
      const contracts = parseFloat(quantityMatch[1]);
      
      const priceLine = lines[startIndex + 7];
      const priceMatch = priceLine.match(/^([\d.]+)$/);
      if (!priceMatch) return null;
      const premiumPerShare = parseFloat(priceMatch[1]);
      
      const feesLine = lines[startIndex + 8];
      const feesMatch = feesLine.match(/^([\d.]+)$/);
      const fees = feesMatch ? parseFloat(feesMatch[1]) : 0;
      
      return this.buildOptionTransaction(ticker, optionType, strikePrice, expirationDate, contracts, premiumPerShare, fees, date, category, action, year, lines, startIndex);
      
    } else {
      // Compact format (SOFI):
      // 0: "SOFI 01/30/2026 PUT SOFI TECHNOLOGIES IN$25.5"
      // 1: "25.50 P"
      // 2: "EXP 01/30/26"
      // 3: Quantity (e.g., "(14.0000)")
      // 4: Price per share (e.g., "1.0200")
      // 5: Charges (e.g., "9.30")
      
      if (startIndex + 5 >= lines.length) return null;
      
      const firstLine = lines[startIndex];
      const tickerMatch = firstLine.match(/^([A-Z]{2,5})/);
      if (!tickerMatch) return null;
      const ticker = tickerMatch[1];
      
      const typeMatch = firstLine.match(/\b(CALL|PUT)\b/);
      if (!typeMatch) return null;
      const optionType = typeMatch[1].toLowerCase() as 'call' | 'put';
      
      const strikeMatch = firstLine.match(/\$(\d+(?:\.\d+)?)/);
      if (!strikeMatch) return null;
      const strikePrice = parseFloat(strikeMatch[1]);
      
      const expLine = lines[startIndex + 2];
      const expMatch = expLine.match(/EXP\s+(\d{2})\/(\d{2})\/(\d{2})/);
      if (!expMatch) return null;
      const expirationDate = `20${expMatch[3]}-${expMatch[1]}-${expMatch[2]}`;
      
      const quantityLine = lines[startIndex + 3];
      const quantityMatch = quantityLine.match(/\(?(\d+\.\d+)\)?/);
      if (!quantityMatch) return null;
      const contracts = parseFloat(quantityMatch[1]);
      
      const priceLine = lines[startIndex + 4];
      const priceMatch = priceLine.match(/^([\d.]+)$/);
      if (!priceMatch) return null;
      const premiumPerShare = parseFloat(priceMatch[1]);
      
      const feesLine = lines[startIndex + 5];
      const feesMatch = feesLine.match(/^([\d.]+)$/);
      const fees = feesMatch ? parseFloat(feesMatch[1]) : 0;
      
      return this.buildOptionTransaction(ticker, optionType, strikePrice, expirationDate, contracts, premiumPerShare, fees, date, category, action, year, lines, startIndex);
    }
  }

  private buildOptionTransaction(
    ticker: string,
    optionType: 'call' | 'put',
    strikePrice: number,
    expirationDate: string,
    contracts: number,
    premiumPerShare: number,
    fees: number,
    date: string,
    category: string,
    action: string,
    year: string,
    lines: string[],
    startIndex: number
  ): ParsedOptionTransaction {
    // Determine action
    // Check if there's a realized gain/loss in the next few lines
    const nextLines = lines.slice(startIndex, Math.min(startIndex + 15, lines.length)).join(' ');
    const hasRealizedGL = /\(ST\)|\(LT\)|,\(ST\)|,\(LT\)/.test(nextLines);
    
    let optionAction: 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close';
    
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
    
    // Parse date
    const fullDate = this.parseDate(`${date}/${year}`);
    
    return {
      date: fullDate,
      ticker,
      optionType,
      action: optionAction,
      contracts: Math.abs(contracts),
      strikePrice,
      premiumPerShare,
      expirationDate,
      fees,
      notes: `Imported from Schwab monthly statement`
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
