import type { StockTransaction, OptionTransaction, InvestmentAccount } from '../types';

function escapeCsvField(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields: (string | number | undefined | null)[]): string {
  return fields.map(escapeCsvField).join(',');
}

function accountName(accounts: InvestmentAccount[], id: string): string {
  return accounts.find(a => a.id === id)?.name ?? id;
}

export function exportStockTransactionsCsv(
  transactions: StockTransaction[],
  accounts: InvestmentAccount[]
): string {
  const header = toCsvRow([
    'Date', 'Account', 'Ticker', 'Action', 'Shares',
    'Price Per Share', 'Total Amount', 'Fees', 'Notes'
  ]);
  const rows = transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => toCsvRow([
      t.date,
      accountName(accounts, t.accountId),
      t.ticker,
      t.action,
      t.shares,
      t.pricePerShare,
      t.totalAmount,
      t.fees,
      t.notes
    ]));
  return [header, ...rows].join('\n');
}

export function exportOptionTransactionsCsv(
  transactions: OptionTransaction[],
  accounts: InvestmentAccount[]
): string {
  const header = toCsvRow([
    'Transaction Date', 'Account', 'Ticker', 'Option Type', 'Action',
    'Contracts', 'Strike Price', 'Premium Per Share', 'Total Premium',
    'Fees', 'Expiration Date', 'Status', 'Realized P/L', 'Notes'
  ]);
  const rows = transactions
    .slice()
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
    .map(t => toCsvRow([
      t.transactionDate,
      accountName(accounts, t.accountId),
      t.ticker,
      t.optionType,
      t.action,
      t.contracts,
      t.strikePrice,
      t.premiumPerShare,
      t.totalPremium,
      t.fees,
      t.expirationDate,
      t.status,
      t.realizedPL,
      t.notes
    ]));
  return [header, ...rows].join('\n');
}

/**
 * Tax-focused export: closed positions with realized P/L, holding period, and short/long term classification.
 */
export function exportTaxSummaryCsv(
  stockTransactions: StockTransaction[],
  optionTransactions: OptionTransaction[],
  accounts: InvestmentAccount[]
): string {
  const header = toCsvRow([
    'Type', 'Account', 'Ticker', 'Open Date', 'Close Date',
    'Holding Days', 'Term', 'Realized P/L', 'Notes'
  ]);

  const rows: string[] = [];

  // Closed option positions
  for (const t of optionTransactions) {
    if (!['closed', 'expired', 'assigned'].includes(t.status)) continue;
    if (t.realizedPL === undefined) continue;
    const openDate = t.transactionDate;
    const closeDate = t.closeDate ?? t.expirationDate;
    const holdingDays = Math.round(
      (new Date(closeDate).getTime() - new Date(openDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const term = holdingDays > 365 ? 'Long-term' : 'Short-term';
    rows.push(toCsvRow([
      'Option',
      accountName(accounts, t.accountId),
      `${t.ticker} ${t.optionType.toUpperCase()} $${t.strikePrice} exp ${t.expirationDate}`,
      openDate,
      closeDate,
      holdingDays,
      term,
      t.realizedPL,
      t.notes
    ]));
  }

  // Stock sells (each sell is a realized event; use simple FIFO approximation for P/L)
  const sells = stockTransactions
    .filter(t => t.action === 'sell')
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const sell of sells) {
    // Find the earliest buy(s) prior to this sell for the same ticker+account
    const priorBuys = stockTransactions
      .filter(t =>
        t.accountId === sell.accountId &&
        t.ticker === sell.ticker &&
        t.action === 'buy' &&
        t.date < sell.date
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (priorBuys.length === 0) continue;

    const openDate = priorBuys[0].date;
    const holdingDays = Math.round(
      (new Date(sell.date).getTime() - new Date(openDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const term = holdingDays > 365 ? 'Long-term' : 'Short-term';
    const costBasis = priorBuys[0].pricePerShare * sell.shares;
    const proceeds = sell.totalAmount - sell.fees;
    const realizedPL = proceeds - costBasis;

    rows.push(toCsvRow([
      'Stock',
      accountName(accounts, sell.accountId),
      sell.ticker,
      openDate,
      sell.date,
      holdingDays,
      term,
      realizedPL,
      sell.notes
    ]));
  }

  return [header, ...rows].join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
