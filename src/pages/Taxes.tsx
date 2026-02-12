import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';

const Taxes: React.FC = () => {
  const { accounts, selectedAccountId, stockTransactions, optionTransactions, settings } = useAppContext();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [taxLotsSortField, setTaxLotsSortField] = useState<'ticker' | 'shares' | 'daysHeld' | 'costBasis' | 'unrealizedGain'>('ticker');
  const [taxLotsSortDirection, setTaxLotsSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const shortTermRate = (settings.taxRates?.shortTerm || 24) / 100;
  const longTermRate = (settings.taxRates?.longTerm || 15) / 100;

  const handleTaxLotsSort = (field: typeof taxLotsSortField) => {
    if (taxLotsSortField === field) {
      setTaxLotsSortDirection(taxLotsSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setTaxLotsSortField(field);
      setTaxLotsSortDirection('asc');
    }
  };

  // Filter transactions by selected account
  const filteredStockTxns = useMemo(() => {
    return stockTransactions.filter(t =>
      !selectedAccountId || t.accountId === selectedAccountId
    );
  }, [stockTransactions, selectedAccountId]);

  const filteredOptionTxns = useMemo(() => {
    return optionTransactions.filter(t =>
      !selectedAccountId || t.accountId === selectedAccountId
    );
  }, [optionTransactions, selectedAccountId]);

  // Calculate tax lots for each stock position
  const taxLots = useMemo(() => {
    const lots: Array<{
      ticker: string;
      shares: number;
      costBasis: number;
      purchaseDate: string;
      daysHeld: number;
      isLongTerm: boolean;
      unrealizedGain: number;
      accountId: string;
    }> = [];

    // Group transactions by ticker and account
    const tickerAccountMap = new Map<string, { ticker: string; accountId: string }>();
    filteredStockTxns.forEach(t => {
      const key = `${t.ticker}::${t.accountId}`;
      if (!tickerAccountMap.has(key)) {
        tickerAccountMap.set(key, { ticker: t.ticker, accountId: t.accountId });
      }
    });

    // Process each ticker-account combination
    tickerAccountMap.forEach(({ ticker, accountId }) => {
      // Get all transactions for this ticker-account, sorted by date
      const txns = filteredStockTxns
        .filter(t => t.ticker === ticker && t.accountId === accountId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Track remaining shares from each buy (FIFO)
      const buyLots: Array<{
        shares: number;
        pricePerShare: number;
        fees: number;
        date: string;
      }> = [];
      
      txns.forEach(txn => {
        if (txn.action === 'buy') {
          // Add new lot
          buyLots.push({
            shares: txn.shares,
            pricePerShare: txn.pricePerShare,
            fees: txn.fees || 0,
            date: txn.date
          });
        } else if (txn.action === 'sell') {
          // Reduce lots using FIFO
          let sharesToSell = txn.shares;
          
          for (let i = 0; i < buyLots.length && sharesToSell > 0; i++) {
            const lot = buyLots[i];
            const sharesFromThisLot = Math.min(lot.shares, sharesToSell);
            lot.shares -= sharesFromThisLot;
            sharesToSell -= sharesFromThisLot;
          }
          
          // Remove fully sold lots (filter in place)
          let writeIdx = 0;
          for (let j = 0; j < buyLots.length; j++) {
            if (buyLots[j].shares > 0) {
              buyLots[writeIdx] = buyLots[j];
              writeIdx++;
            }
          }
          buyLots.length = writeIdx;
        }
      });
      
      // Convert remaining buy lots to tax lots
      const today = new Date();
      buyLots.forEach(lot => {
        if (lot.shares > 0) {
          const purchaseDate = new Date(lot.date);
          const daysHeld = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
          const isLongTerm = daysHeld >= 365;
          
          // Simplified: assume current market value equals cost basis for demo
          const currentValue = lot.shares * lot.pricePerShare;
          const costBasis = lot.shares * lot.pricePerShare + lot.fees;
          const unrealizedGain = currentValue - costBasis;

          lots.push({
            ticker,
            shares: lot.shares,
            costBasis,
            purchaseDate: lot.date,
            daysHeld,
            isLongTerm,
            unrealizedGain,
            accountId
          });
        }
      });
    });

    return lots;
  }, [filteredStockTxns]);

  // Calculate realized gains for the selected year
  const realizedGains = useMemo(() => {
    let longTermGains = 0;
    let shortTermGains = 0;
    let optionPremium = 0;

    // Stock sales - proper FIFO matching
    // Group all buy transactions by ticker+account, sorted by date (FIFO)
    const buyLotTracker = new Map<string, Array<{ shares: number; pricePerShare: number; feePerShare: number; date: string }>>(); 
    
    // Build buy lots from all buy transactions (sorted chronologically)
    const allSortedTxns = [...filteredStockTxns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    allSortedTxns.forEach(txn => {
      if (txn.action === 'buy') {
        const key = `${txn.ticker}::${txn.accountId}`;
        if (!buyLotTracker.has(key)) buyLotTracker.set(key, []);
        buyLotTracker.get(key)!.push({
          shares: txn.shares,
          pricePerShare: txn.pricePerShare,
          feePerShare: txn.shares > 0 ? (txn.fees || 0) / txn.shares : 0,
          date: txn.date
        });
      }
    });

    // Process sell transactions in chronological order, matching against FIFO lots
    allSortedTxns.forEach(txn => {
      if (txn.action !== 'sell') return;
      if (new Date(txn.date).getFullYear() !== selectedYear) {
        // Still need to consume lots for sells in other years to keep FIFO accurate
        const key = `${txn.ticker}::${txn.accountId}`;
        const lots = buyLotTracker.get(key) || [];
        let sharesToSell = txn.shares;
        for (let i = 0; i < lots.length && sharesToSell > 0; i++) {
          const consumed = Math.min(lots[i].shares, sharesToSell);
          lots[i].shares -= consumed;
          sharesToSell -= consumed;
        }
        // Clean up empty lots
        buyLotTracker.set(key, lots.filter(l => l.shares > 0));
        return;
      }

      const key = `${txn.ticker}::${txn.accountId}`;
      const lots = buyLotTracker.get(key) || [];
      let sharesToSell = txn.shares;
      const saleDate = new Date(txn.date);
      const salePricePerShare = txn.pricePerShare;
      const saleFees = txn.fees || 0;
      // Distribute fees proportionally across lots
      const totalSaleShares = txn.shares;

      for (let i = 0; i < lots.length && sharesToSell > 0; i++) {
        const lot = lots[i];
        const sharesFromThisLot = Math.min(lot.shares, sharesToSell);
        const purchaseDate = new Date(lot.date);
        const daysHeld = Math.floor((saleDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
        const isLongTerm = daysHeld >= 365;

        // Proportional fees
        const proportionalSaleFees = (sharesFromThisLot / totalSaleShares) * saleFees;
        const proportionalBuyFees = sharesFromThisLot * lot.feePerShare;

        const proceeds = sharesFromThisLot * salePricePerShare - proportionalSaleFees;
        const costBasis = sharesFromThisLot * lot.pricePerShare + proportionalBuyFees;
        const gain = proceeds - costBasis;

        if (isLongTerm) {
          longTermGains += gain;
        } else {
          shortTermGains += gain;
        }

        lot.shares -= sharesFromThisLot;
        sharesToSell -= sharesFromThisLot;
      }
      // Clean up empty lots
      buyLotTracker.set(key, lots.filter(l => l.shares > 0));
    });

    // Option realized P&L - use closing transactions that have realizedPL
    const closedOptions = filteredOptionTxns.filter(t =>
      (t.status === 'closed' || t.status === 'expired' || t.status === 'assigned') &&
      new Date(t.transactionDate).getFullYear() === selectedYear &&
      (t.action === 'buy-to-close' || t.action === 'sell-to-close')
    );

    closedOptions.forEach(txn => {
      optionPremium += (txn.realizedPL || 0);
    });

    // Also include expired/assigned options (they don't have a closing transaction with buy-to-close/sell-to-close)
    // For expired options, the opening transaction has status 'expired' or 'assigned'
    // But actually, the close flow creates a closing transaction, so let's also check
    // for opening transactions that expired (no closing counterpart)
    const expiredAssignedFromOpen = filteredOptionTxns.filter(t =>
      (t.status === 'expired' || t.status === 'assigned') &&
      new Date(t.transactionDate).getFullYear() === selectedYear &&
      (t.action === 'sell-to-open' || t.action === 'buy-to-open')
    );
    
    // Only count these if there's no corresponding closing transaction already counted
    expiredAssignedFromOpen.forEach(openTxn => {
      const hasClosingTxn = closedOptions.some(ct =>
        ct.ticker === openTxn.ticker &&
        ct.strikePrice === openTxn.strikePrice &&
        ct.expirationDate === openTxn.expirationDate &&
        ct.accountId === openTxn.accountId
      );
      if (!hasClosingTxn) {
        // No closing transaction found, calculate P&L from the opening transaction
        if (openTxn.action === 'sell-to-open') {
          optionPremium += openTxn.totalPremium - (openTxn.fees || 0);
        } else {
          optionPremium -= openTxn.totalPremium + (openTxn.fees || 0);
        }
      }
    });

    return {
      longTermGains,
      shortTermGains,
      optionPremium,
      totalGains: longTermGains + shortTermGains + optionPremium
    };
  }, [filteredStockTxns, filteredOptionTxns, selectedYear]);

  // Calculate unrealized gains by tax treatment
  const unrealizedGainsSummary = useMemo(() => {
    const longTerm = taxLots.filter(lot => lot.isLongTerm).reduce((sum, lot) => sum + lot.unrealizedGain, 0);
    const shortTerm = taxLots.filter(lot => !lot.isLongTerm).reduce((sum, lot) => sum + lot.unrealizedGain, 0);
    
    return {
      longTerm,
      shortTerm,
      total: longTerm + shortTerm
    };
  }, [taxLots]);

  // Estimate tax liability using configured tax rates
  const estimatedTax = useMemo(() => {
    const shortTermTax = Math.max(0, realizedGains.shortTermGains * shortTermRate);
    const longTermTax = Math.max(0, realizedGains.longTermGains * longTermRate);
    const optionTax = Math.max(0, realizedGains.optionPremium * shortTermRate); // Options are short-term

    return {
      shortTermTax,
      longTermTax,
      optionTax,
      totalTax: shortTermTax + longTermTax + optionTax
    };
  }, [realizedGains, shortTermRate, longTermRate]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Tax Tracking</h1>
          <p className="text-gray-400 mt-1">Capital gains, tax lots, and estimated tax liability</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Tax Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Realized Gains Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">Long-Term Gains</h3>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <p className={`text-2xl font-bold ${realizedGains.longTermGains >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(realizedGains.longTermGains)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Held &gt; 365 days</p>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">Short-Term Gains</h3>
            <TrendingDown className="w-5 h-5 text-yellow-400" />
          </div>
          <p className={`text-2xl font-bold ${realizedGains.shortTermGains >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(realizedGains.shortTermGains)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Held &lt; 365 days</p>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">Option Premium</h3>
            <Calendar className="w-5 h-5 text-blue-400" />
          </div>
          <p className={`text-2xl font-bold ${realizedGains.optionPremium >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(realizedGains.optionPremium)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Short-term income</p>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">Est. Tax Liability</h3>
            <DollarSign className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-red-400">
            {formatCurrency(estimatedTax.totalTax)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Simplified estimate</p>
        </div>
      </div>

      {/* Unrealized Gains Summary */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Unrealized Gains</h2>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">Requires market data for accuracy</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-400 mb-1">Long-Term (Held &gt; 365 days)</p>
            <p className={`text-xl font-bold ${unrealizedGainsSummary.longTerm >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(unrealizedGainsSummary.longTerm)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Short-Term (Held &lt; 365 days)</p>
            <p className={`text-xl font-bold ${unrealizedGainsSummary.shortTerm >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(unrealizedGainsSummary.shortTerm)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Total Unrealized</p>
            <p className={`text-xl font-bold ${unrealizedGainsSummary.total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(unrealizedGainsSummary.total)}
            </p>
          </div>
        </div>
      </div>

      {/* Tax Lots Table */}
      <div className="bg-gray-900 rounded-lg shadow border border-gray-800">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Tax Lots by Ticker</h2>
          <p className="text-sm text-gray-400 mt-1">Individual purchase lots with holding period</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th 
                  onClick={() => handleTaxLotsSort('ticker')}
                  className="text-left py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                >
                  Ticker {taxLotsSortField === 'ticker' && (taxLotsSortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleTaxLotsSort('shares')}
                  className="text-right py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                >
                  Shares {taxLotsSortField === 'shares' && (taxLotsSortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Purchase Date</th>
                <th 
                  onClick={() => handleTaxLotsSort('daysHeld')}
                  className="text-right py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                >
                  Days Held {taxLotsSortField === 'daysHeld' && (taxLotsSortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-300">Tax Treatment</th>
                <th 
                  onClick={() => handleTaxLotsSort('costBasis')}
                  className="text-right py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                >
                  Cost Basis {taxLotsSortField === 'costBasis' && (taxLotsSortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleTaxLotsSort('unrealizedGain')}
                  className="text-right py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                >
                  Unrealized Gain {taxLotsSortField === 'unrealizedGain' && (taxLotsSortDirection === 'asc' ? '↑' : '↓')}
                </th>
                {!selectedAccountId && (
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Account</th>
                )}
              </tr>
            </thead>
            <tbody>
              {[...taxLots]
                .sort((a, b) => {
                  const aVal = a[taxLotsSortField];
                  const bVal = b[taxLotsSortField];
                  const multiplier = taxLotsSortDirection === 'asc' ? 1 : -1;
                  
                  if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return aVal.localeCompare(bVal) * multiplier;
                  }
                  return ((aVal as number) - (bVal as number)) * multiplier;
                })
                .length === 0 ? (
                <tr>
                  <td colSpan={!selectedAccountId ? 8 : 7} className="text-center py-8 text-gray-500">
                    No tax lots found
                  </td>
                </tr>
              ) : (
                [...taxLots]
                  .sort((a, b) => {
                    const aVal = a[taxLotsSortField];
                    const bVal = b[taxLotsSortField];
                    const multiplier = taxLotsSortDirection === 'asc' ? 1 : -1;
                    
                    if (typeof aVal === 'string' && typeof bVal === 'string') {
                      return aVal.localeCompare(bVal) * multiplier;
                    }
                    return ((aVal as number) - (bVal as number)) * multiplier;
                  })
                  .map((lot, index) => {
                  const account = accounts.find(a => a.id === lot.accountId);
                  return (
                    <tr key={index} className="border-b border-gray-800 hover:bg-gray-800">
                      <td className="py-3 px-4 text-sm text-white font-medium">{lot.ticker}</td>
                      <td className="py-3 px-4 text-sm text-right text-white">{lot.shares}</td>
                      <td className="py-3 px-4 text-sm text-white">
                        {new Date(lot.purchaseDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-white">{lot.daysHeld}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                          lot.isLongTerm
                            ? 'bg-green-900 text-green-300'
                            : 'bg-yellow-900 text-yellow-300'
                        }`}>
                          {lot.isLongTerm ? 'Long-Term' : 'Short-Term'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-white">
                        {formatCurrency(lot.costBasis)}
                      </td>
                      <td className={`py-3 px-4 text-sm text-right font-medium ${
                        lot.unrealizedGain >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(lot.unrealizedGain)}
                      </td>
                      {!selectedAccountId && (
                        <td className="py-3 px-4 text-sm text-blue-400">{account?.name}</td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tax Estimation Breakdown */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Estimated Tax Breakdown</h2>
        <p className="text-sm text-gray-400 mb-4">
          Simplified calculation using standard tax rates. Consult a tax professional for accurate estimates.
        </p>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-800">
            <span className="text-gray-300">Short-Term Gains Tax ({(shortTermRate * 100).toFixed(1)}% rate)</span>
            <span className="text-white font-medium">{formatCurrency(estimatedTax.shortTermTax)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-800">
            <span className="text-gray-300">Long-Term Gains Tax ({(longTermRate * 100).toFixed(1)}% rate)</span>
            <span className="text-white font-medium">{formatCurrency(estimatedTax.longTermTax)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-800">
            <span className="text-gray-300">Option Premium Tax ({(shortTermRate * 100).toFixed(1)}% rate)</span>
            <span className="text-white font-medium">{formatCurrency(estimatedTax.optionTax)}</span>
          </div>
          <div className="flex justify-between items-center py-3 bg-gray-800 rounded-lg px-4">
            <span className="text-white font-semibold">Total Estimated Tax</span>
            <span className="text-red-400 font-bold text-lg">{formatCurrency(estimatedTax.totalTax)}</span>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg p-4">
        <p className="text-sm text-yellow-300">
          <strong>Disclaimer:</strong> This is a simplified tax estimation tool for informational purposes only. 
          Actual tax liability depends on your individual tax situation, income level, and other factors. 
          Please consult with a qualified tax professional for accurate tax planning and filing.
        </p>
      </div>
    </div>
  );
};

export default Taxes;
