import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  calculatePortfolioSummary,
  calculateOptionsAnalytics,
  calculateStockAnalytics,
  formatCurrency,
  formatPercentage
} from '../utils/calculations';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';
import { TrendingUp, PieChart, BarChart3, DollarSign } from 'lucide-react';

type TimePeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const Analytics: React.FC = () => {
  const {
    accounts,
    stockPositions,
    optionPositions,
    stockTransactions,
    optionTransactions,
    selectedAccountId
  } = useAppContext();

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('6M');
  
  const portfolioSummary = calculatePortfolioSummary(
    accounts,
    stockPositions,
    optionPositions,
    selectedAccountId || undefined
  );
  
  const optionsAnalytics = calculateOptionsAnalytics(
    optionTransactions,
    optionPositions,
    selectedAccountId || undefined
  );
  
  const stockAnalytics = calculateStockAnalytics(
    stockTransactions,
    stockPositions,
    selectedAccountId || undefined
  );

  // Filter transactions by time period
  const getDateCutoff = (period: TimePeriod): Date => {
    const now = new Date();
    switch (period) {
      case '1M':
        return new Date(now.setMonth(now.getMonth() - 1));
      case '3M':
        return new Date(now.setMonth(now.getMonth() - 3));
      case '6M':
        return new Date(now.setMonth(now.getMonth() - 6));
      case '1Y':
        return new Date(now.setFullYear(now.getFullYear() - 1));
      case 'ALL':
        return new Date(0);
    }
  };

  const filteredOptionTransactions = useMemo(() => {
    const cutoff = getDateCutoff(timePeriod);
    return optionTransactions.filter(t => new Date(t.transactionDate) >= cutoff);
  }, [optionTransactions, timePeriod]);

  // Calculate cumulative premium over time
  const premiumOverTime = useMemo(() => {
    const sorted = [...filteredOptionTransactions]
      .filter(t => t.action === 'sell-to-open')
      .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

    let cumulative = 0;
    const data = sorted.map(t => {
      cumulative += t.totalPremium - t.fees;
      return {
        date: new Date(t.transactionDate).toLocaleDateString(),
        premium: cumulative
      };
    });

    return {
      labels: data.map(d => d.date),
      datasets: [
        {
          label: 'Cumulative Premium',
          data: data.map(d => d.premium),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.4
        }
      ]
    };
  }, [filteredOptionTransactions]);

  // Calculate premium by strategy
  const premiumByStrategy = useMemo(() => {
    const strategyTotals: Record<string, number> = {};
    
    filteredOptionTransactions
      .filter(t => t.action === 'sell-to-open')
      .forEach(t => {
        const strategy = t.strategy.replace(/-/g, ' ');
        strategyTotals[strategy] = (strategyTotals[strategy] || 0) + t.totalPremium;
      });

    const labels = Object.keys(strategyTotals);
    const data = Object.values(strategyTotals);

    return {
      labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
      datasets: [
        {
          label: 'Premium by Strategy',
          data,
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(34, 197, 94, 0.8)',
            'rgba(251, 146, 60, 0.8)',
            'rgba(168, 85, 247, 0.8)',
            'rgba(236, 72, 153, 0.8)',
          ]
        }
      ]
    };
  }, [filteredOptionTransactions]);

  // Calculate monthly premium
  const monthlyPremium = useMemo(() => {
    const monthlyTotals: Record<string, number> = {};
    
    filteredOptionTransactions
      .filter(t => t.action === 'sell-to-open')
      .forEach(t => {
        const month = new Date(t.transactionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        monthlyTotals[month] = (monthlyTotals[month] || 0) + t.totalPremium;
      });

    const sorted = Object.entries(monthlyTotals).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    return {
      labels: sorted.map(([month]) => month),
      datasets: [
        {
          label: 'Monthly Premium',
          data: sorted.map(([, total]) => total),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
        }
      ]
    };
  }, [filteredOptionTransactions]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: 'rgb(156, 163, 175)'
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: 'rgb(156, 163, 175)'
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.1)'
        }
      },
      y: {
        ticks: {
          color: 'rgb(156, 163, 175)'
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.1)'
        }
      }
    }
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: 'rgb(156, 163, 175)'
        }
      }
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header with Time Period Selector */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics & Reports</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {selectedAccountId
              ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
              : 'Viewing: All Accounts'}
          </p>
        </div>

        {/* Time Period Selector */}
        <div className="flex gap-2">
          {(['1M', '3M', '6M', '1Y', 'ALL'] as TimePeriod[]).map((period) => (
            <button
              key={period}
              onClick={() => setTimePeriod(period)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                timePeriod === period
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      
      {/* Portfolio Overview */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5" />
          Portfolio Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Value</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(portfolioSummary.totalValue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Invested</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(portfolioSummary.totalInvested)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total P&L</p>
            <p className={`text-2xl font-bold mt-1 ${
              portfolioSummary.totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(portfolioSummary.totalPL)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Return %</p>
            <p className={`text-2xl font-bold mt-1 ${
              portfolioSummary.totalPLPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {formatPercentage(portfolioSummary.totalPLPercent)}
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative Premium Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cumulative Premium Over Time
          </h3>
          <div className="h-64">
            {premiumOverTime.labels.length > 0 ? (
              <Line data={premiumOverTime} options={chartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No data available for selected period
              </div>
            )}
          </div>
        </div>

        {/* Monthly Premium Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Monthly Premium
          </h3>
          <div className="h-64">
            {monthlyPremium.labels.length > 0 ? (
              <Bar data={monthlyPremium} options={chartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No data available for selected period
              </div>
            )}
          </div>
        </div>

        {/* Premium by Strategy Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Premium by Strategy
          </h3>
          <div className="h-64">
            {premiumByStrategy.labels.length > 0 ? (
              <Pie data={premiumByStrategy} options={pieChartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No data available for selected period
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Asset Allocation */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Asset Allocation
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Stocks</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(portfolioSummary.stockValue)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {portfolioSummary.totalValue > 0
                ? ((portfolioSummary.stockValue / portfolioSummary.totalValue) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Options</p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(portfolioSummary.optionValue)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {portfolioSummary.totalValue > 0
                ? ((portfolioSummary.optionValue / portfolioSummary.totalValue) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Cash</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(portfolioSummary.totalCash)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {portfolioSummary.totalValue > 0
                ? ((portfolioSummary.totalCash / portfolioSummary.totalValue) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
        </div>
      </div>
      
      {/* Stock Analytics */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Stock Analytics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Positions</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {stockAnalytics.positionCount}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Stock Value</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(stockAnalytics.totalStockValue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Cost Basis</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(stockAnalytics.totalCostBasis)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Unrealized P&L</p>
            <p className={`text-2xl font-bold mt-1 ${
              stockAnalytics.totalUnrealizedPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(stockAnalytics.totalUnrealizedPL)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Realized P&L</p>
            <p className={`text-2xl font-bold mt-1 ${
              stockAnalytics.totalRealizedPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(stockAnalytics.totalRealizedPL)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Avg Holding Period</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {stockAnalytics.averageHoldingPeriod.toFixed(0)} days
            </p>
          </div>
        </div>
      </div>
      
      {/* Options Analytics */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Options Analytics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Premium Collected</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
              {formatCurrency(optionsAnalytics.totalPremiumCollected)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Premium Paid</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
              {formatCurrency(optionsAnalytics.totalPremiumPaid)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Net Premium</p>
            <p className={`text-2xl font-bold mt-1 ${
              optionsAnalytics.netPremium >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(optionsAnalytics.netPremium)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Win Rate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {optionsAnalytics.winRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Annualized Return</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
              {optionsAnalytics.annualizedReturn.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Assignment Rate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {optionsAnalytics.assignmentRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Avg Return Per Trade</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(optionsAnalytics.averageReturnPerTrade)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Avg Days to Close</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {optionsAnalytics.averageDaysToClose.toFixed(0)} days
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Collateral Efficiency</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {optionsAnalytics.collateralEfficiency.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
      
      {/* Collateral Tracking */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Collateral Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Active Collateral</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(optionsAnalytics.activeCollateral)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Currently reserved</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Available Cash</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(portfolioSummary.totalCash - optionsAnalytics.activeCollateral)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">For new trades</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Projected Premium</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(optionsAnalytics.projectedPremium)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">From open positions</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
