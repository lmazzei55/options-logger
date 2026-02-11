import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';

const Taxes: React.FC = () => {
  const { accounts, selectedAccountId, stockTransactions, optionTransactions, stockPositions } = useAppContext();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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

    // Group buy transactions by ticker and account
    const buyTxns = filteredStockTxns.filter(t => t.action === 'buy');
    
    buyTxns.forEach(txn => {
      const position = stockPositions.find(
        p => p.ticker === txn.ticker && p.accountId === txn.accountId
      );
      
      if (position && position.shares > 0) {
        const purchaseDate = new Date(txn.date);
        const today = new Date();
        const daysHeld = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
        const isLongTerm = daysHeld >= 365;
        
        // Simplified: assume current market value equals cost basis for demo
        // In reality, you'd fetch current market prices
        const currentValue = txn.shares * txn.pricePerShare;
        const costBasis = txn.shares * txn.pricePerShare + (txn.fees || 0);
        const unrealizedGain = currentValue - costBasis;

        lots.push({
          ticker: txn.ticker,
          shares: txn.shares,
          costBasis,
          purchaseDate: txn.date,
          daysHeld,
          isLongTerm,
          unrealizedGain,
          accountId: txn.accountId
        });
      }
    });

    return lots;
  }, [filteredStockTxns, stockPositions]);

  // Calculate realized gains for the selected year
  const realizedGains = useMemo(() => {
    let longTermGains = 0;
    let shortTermGains = 0;
    let optionPremium = 0;

    // Stock sales
    const sellTxns = filteredStockTxns.filter(t => 
      t.action === 'sell' && 
      new Date(t.date).getFullYear() === selectedYear
    );

    sellTxns.forEach(sellTxn => {
      // Find corresponding buy transaction (simplified FIFO)
      const buyTxn = filteredStockTxns.find(t =>
        t.action === 'buy' &&
        t.ticker === sellTxn.ticker &&
        t.accountId === sellTxn.accountId &&
        new Date(t.date) < new Date(sellTxn.date)
      );

      if (buyTxn) {
        const purchaseDate = new Date(buyTxn.date);
        const saleDate = new Date(sellTxn.date);
        const daysHeld = Math.floor((saleDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
        const isLongTerm = daysHeld >= 365;

        const proceeds = sellTxn.shares * sellTxn.pricePerShare - (sellTxn.fees || 0);
        const costBasis = sellTxn.shares * buyTxn.pricePerShare + (buyTxn.fees || 0);
        const gain = proceeds - costBasis;

        if (isLongTerm) {
          longTermGains += gain;
        } else {
          shortTermGains += gain;
        }
      }
    });

    // Option premium (always short-term)
    const closedOptions = filteredOptionTxns.filter(t =>
      t.status === 'closed' &&
      new Date(t.transactionDate).getFullYear() === selectedYear &&
      (t.action === 'sell-to-open' || t.action === 'buy-to-open')
    );

    closedOptions.forEach(txn => {
      const premium = txn.contracts * 100 * txn.premiumPerShare - (txn.fees || 0);
      optionPremium += premium;
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

  // Estimate tax liability (simplified using standard brackets)
  const estimatedTax = useMemo(() => {
    // Simplified tax calculation
    // Short-term gains taxed as ordinary income (assume 24% bracket)
    // Long-term gains taxed at 15% (for most taxpayers)
    const shortTermTax = Math.max(0, realizedGains.shortTermGains * 0.24);
    const longTermTax = Math.max(0, realizedGains.longTermGains * 0.15);
    const optionTax = Math.max(0, realizedGains.optionPremium * 0.24); // Options are short-term

    return {
      shortTermTax,
      longTermTax,
      optionTax,
      totalTax: shortTermTax + longTermTax + optionTax
    };
  }, [realizedGains]);

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
        <h2 className="text-xl font-semibold text-white mb-4">Unrealized Gains</h2>
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
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Ticker</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Shares</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Purchase Date</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Days Held</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-300">Tax Treatment</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Cost Basis</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Unrealized Gain</th>
                {!selectedAccountId && (
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Account</th>
                )}
              </tr>
            </thead>
            <tbody>
              {taxLots.length === 0 ? (
                <tr>
                  <td colSpan={!selectedAccountId ? 8 : 7} className="text-center py-8 text-gray-500">
                    No tax lots found
                  </td>
                </tr>
              ) : (
                taxLots.map((lot, index) => {
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
            <span className="text-gray-300">Short-Term Gains Tax (24% rate)</span>
            <span className="text-white font-medium">{formatCurrency(estimatedTax.shortTermTax)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-800">
            <span className="text-gray-300">Long-Term Gains Tax (15% rate)</span>
            <span className="text-white font-medium">{formatCurrency(estimatedTax.longTermTax)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-800">
            <span className="text-gray-300">Option Premium Tax (24% rate)</span>
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
