import React, { useEffect, useRef } from 'react';
import { Chart as ChartJS } from 'chart.js/auto';
import type { StockPosition, PortfolioSummary } from '../../types';
import { formatCurrency } from '../../utils/calculations';

interface PortfolioChartsProps {
  portfolioSummary: PortfolioSummary;
  stockPositions: StockPosition[];
}

const PortfolioCharts: React.FC<PortfolioChartsProps> = ({ portfolioSummary, stockPositions }) => {
  const assetAllocationRef = useRef<HTMLCanvasElement>(null);
  const stockAllocationRef = useRef<HTMLCanvasElement>(null);
  const assetChartInstance = useRef<ChartJS | null>(null);
  const stockChartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!assetAllocationRef.current) return;

    // Destroy existing chart
    if (assetChartInstance.current) {
      assetChartInstance.current.destroy();
    }

    const ctx = assetAllocationRef.current.getContext('2d');
    if (!ctx) return;

    const data = {
      labels: ['Available Cash', 'Active Collateral', 'Stock Holdings'],
      datasets: [{
        data: [
          portfolioSummary.availableCash,
          portfolioSummary.activeCollateral,
          portfolioSummary.stockValue
        ],
        backgroundColor: [
          '#10b981', // green for available cash
          '#f59e0b', // yellow for collateral
          '#3b82f6'  // blue for stocks
        ],
        borderColor: '#1f2937',
        borderWidth: 2
      }]
    };

    assetChartInstance.current = new ChartJS(ctx, {
      type: 'pie',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#d1d5db',
              padding: 15,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0) as number;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${formatCurrency(value)} (${percentage}%)`;
              }
            }
          }
        }
      }
    });

    return () => {
      if (assetChartInstance.current) {
        assetChartInstance.current.destroy();
      }
    };
  }, [portfolioSummary]);

  useEffect(() => {
    if (!stockAllocationRef.current || stockPositions.length === 0) return;

    // Destroy existing chart
    if (stockChartInstance.current) {
      stockChartInstance.current.destroy();
    }

    const ctx = stockAllocationRef.current.getContext('2d');
    if (!ctx) return;

    // Aggregate by ticker if needed
    const aggregated = stockPositions.reduce((acc, pos) => {
      const existing = acc.find(p => p.ticker === pos.ticker);
      const value = pos.marketValue || pos.totalCostBasis;
      if (existing) {
        existing.value += value;
      } else {
        acc.push({ ticker: pos.ticker, value });
      }
      return acc;
    }, [] as { ticker: string; value: number }[]);

    // Sort by value and take top 10
    const top10 = aggregated
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];

    const data = {
      labels: top10.map(p => p.ticker),
      datasets: [{
        data: top10.map(p => p.value),
        backgroundColor: colors.slice(0, top10.length),
        borderColor: '#1f2937',
        borderWidth: 2
      }]
    };

    stockChartInstance.current = new ChartJS(ctx, {
      type: 'pie',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#d1d5db',
              padding: 15,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0) as number;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${formatCurrency(value)} (${percentage}%)`;
              }
            }
          }
        }
      }
    });

    return () => {
      if (stockChartInstance.current) {
        stockChartInstance.current.destroy();
      }
    };
  }, [stockPositions]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Asset Allocation Chart */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Portfolio Composition</h2>
        <div className="flex justify-center">
          <canvas ref={assetAllocationRef} style={{ maxHeight: '300px' }}></canvas>
        </div>
      </div>

      {/* Stock Allocation Chart */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Stock Allocation</h2>
        {stockPositions.length > 0 ? (
          <div className="flex justify-center">
            <canvas ref={stockAllocationRef} style={{ maxHeight: '300px' }}></canvas>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No stock positions yet</p>
        )}
      </div>
    </div>
  );
};

export default PortfolioCharts;
