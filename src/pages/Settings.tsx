import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Download, Upload, Trash2, Database, AlertCircle, CheckCircle } from 'lucide-react';

const Settings: React.FC = () => {
  const { loadMockData, clearAllData, exportData, importData, settings, updateSettings } = useAppContext();
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showConfirmMock, setShowConfirmMock] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleLoadMockData = () => {
    loadMockData();
    setShowConfirmMock(false);
    showNotification('success', 'Mock data loaded successfully!');
  };

  const handleClearAllData = () => {
    clearAllData();
    setShowConfirmClear(false);
    showNotification('success', 'All data cleared successfully!');
  };

  const handleExportData = () => {
    const jsonData = exportData();
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investment-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('success', 'Data exported successfully!');
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string;
        const success = importData(jsonData);
        if (success) {
          showNotification('success', 'Data imported successfully!');
        } else {
          showNotification('error', 'Failed to import data. Please check the file format.');
        }
      } catch {
        showNotification('error', 'Failed to import data. Invalid file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your preferences and data</p>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          notification.type === 'success'
            ? 'bg-green-900/30 text-green-400 border border-green-700'
            : 'bg-red-900/30 text-red-400 border border-red-700'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Appearance Settings */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Appearance</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date Format
            </label>
            <select
              value={settings.dateFormat}
              onChange={(e) => updateSettings({ dateFormat: e.target.value })}
              className="w-full md:w-64 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Currency
            </label>
            <select
              value={settings.defaultCurrency}
              onChange={(e) => updateSettings({ defaultCurrency: e.target.value })}
              className="w-full md:w-64 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Management
        </h2>

        <div className="space-y-4">
          {/* Load Mock Data */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">Load Mock Data</h3>
            <p className="text-sm text-gray-400 mb-4">
              Load sample data to explore the app's features. This will replace all existing data.
            </p>
            {!showConfirmMock ? (
              <button
                onClick={() => setShowConfirmMock(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Database className="w-4 h-4" />
                Load Mock Data
              </button>
            ) : (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
                <p className="text-sm text-yellow-300 mb-3">
                  Are you sure? This will replace all existing data with mock data.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleLoadMockData}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                  >
                    Yes, Load Mock Data
                  </button>
                  <button
                    onClick={() => setShowConfirmMock(false)}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Export Data */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">Export Data</h3>
            <p className="text-sm text-gray-400 mb-4">
              Download all your data as a JSON file for backup or migration.
            </p>
            <button
              onClick={handleExportData}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Data
            </button>
          </div>

          {/* Import Data */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">Import Data</h3>
            <p className="text-sm text-gray-400 mb-4">
              Import data from a previously exported JSON file. This will replace all existing data.
            </p>
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer w-fit">
              <Upload className="w-4 h-4" />
              Import Data
              <input
                type="file"
                accept=".json"
                onChange={handleImportData}
                className="hidden"
              />
            </label>
          </div>

          {/* Clear All Data */}
          <div className="border border-red-800 rounded-lg p-4 bg-red-900/20">
            <h3 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Danger Zone
            </h3>
            <p className="text-sm text-red-300/80 mb-4">
              Permanently delete all data. This action cannot be undone.
            </p>
            {!showConfirmClear ? (
              <button
                onClick={() => setShowConfirmClear(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear All Data
              </button>
            ) : (
              <div className="bg-red-900/40 border border-red-700 rounded-lg p-4">
                <p className="text-sm text-red-300 mb-3 font-semibold">
                  Are you absolutely sure? This will permanently delete ALL data and cannot be undone!
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearAllData}
                    className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors"
                  >
                    Yes, Delete Everything
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart Preferences */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Chart Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Time Range
            </label>
            <select
              value={settings.chartPreferences.defaultTimeRange}
              onChange={(e) => updateSettings({
                chartPreferences: {
                  ...settings.chartPreferences,
                  defaultTimeRange: e.target.value as 'ALL' | '1M' | '3M' | '6M' | '1Y'
                }
              })}
              className="w-full md:w-64 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1M">1 Month</option>
              <option value="3M">3 Months</option>
              <option value="6M">6 Months</option>
              <option value="1Y">1 Year</option>
              <option value="ALL">All Time</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Chart Type
            </label>
            <select
              value={settings.chartPreferences.defaultChartType}
              onChange={(e) => updateSettings({
                chartPreferences: {
                  ...settings.chartPreferences,
                  defaultChartType: e.target.value as 'line' | 'bar' | 'candlestick'
                }
              })}
              className="w-full md:w-64 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="line">Line Chart</option>
              <option value="bar">Bar Chart</option>
              <option value="candlestick">Candlestick</option>
            </select>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">About</h2>
        <div className="space-y-2 text-sm text-gray-400">
          <p><strong className="text-gray-300">Version:</strong> 1.0.0</p>
          <p><strong className="text-gray-300">Built with:</strong> React + TypeScript + Vite + TailwindCSS</p>
          <p><strong className="text-gray-300">Data Storage:</strong> Browser localStorage</p>
          <p className="pt-4 text-xs text-gray-500">
            Investment Tracker &copy; 2026 - A comprehensive tool for tracking stocks and options investments
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
