import React, { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  LineChart,
  Receipt,
  Settings as SettingsIcon,
  Menu,
  X,
  DollarSign
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { accounts, selectedAccountId, setSelectedAccountId } = useAppContext();

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
    
    const observer = new MutationObserver(() => {
      if (!document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.add('dark');
      }
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  const isActivePath = (path: string) => {
    return location.pathname === path;
  };

  const navItems = [
    {
      path: '/',
      name: 'Dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />
    },
    {
      path: '/stocks',
      name: 'Stocks',
      icon: <TrendingUp className="h-5 w-5" />
    },
    {
      path: '/options',
      name: 'Options',
      icon: <LineChart className="h-5 w-5" />
    },
    {
      path: '/transactions',
      name: 'Transactions',
      icon: <Receipt className="h-5 w-5" />
    },
    {
      path: '/analytics',
      name: 'Analytics',
      icon: <LineChart className="h-5 w-5" />
    },
    {
      path: '/accounts',
      name: 'Accounts',
      icon: <Wallet className="h-5 w-5" />
    },
    {
      path: '/settings',
      name: 'Settings',
      icon: <SettingsIcon className="h-5 w-5" />
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-800">
      {/* Header */}
      <header className="bg-blue-600 dark:bg-gray-900 text-white shadow-md z-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center">
              <Link to="/" className="flex items-center">
                <DollarSign className="h-8 w-8 mr-2" />
                <span className="text-xl font-bold">InvestTrack</span>
              </Link>
            </div>
            
            <div className="hidden md:flex items-center space-x-4">
              {/* Account Selector */}
              <select
                value={selectedAccountId || 'all'}
                onChange={(e) => setSelectedAccountId(e.target.value === 'all' ? null : e.target.value)}
                className="px-4 py-2 rounded-md bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Accounts</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden text-white focus:outline-none"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </header>
      
      <div className="flex flex-1">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:block w-64 bg-white dark:bg-gray-900 shadow-md">
          <nav className="mt-5 px-2">
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors ${
                      isActivePath(item.path)
                        ? 'bg-blue-100 text-blue-700 dark:bg-gray-800 dark:text-blue-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="mr-3">{item.icon}</span>
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        
        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75">
            <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-900 shadow-lg z-50">
              <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
                <Link to="/" className="flex items-center" onClick={() => setIsMobileMenuOpen(false)}>
                  <DollarSign className="h-7 w-7 text-blue-600 dark:text-blue-400 mr-2" />
                  <span className="text-lg font-bold text-gray-900 dark:text-white">InvestTrack</span>
                </Link>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-gray-500 dark:text-gray-400 focus:outline-none"
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <nav className="mt-5 px-2">
                <ul className="space-y-2">
                  {navItems.map((item) => (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className={`flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors ${
                          isActivePath(item.path)
                            ? 'bg-blue-100 text-blue-700 dark:bg-gray-800 dark:text-blue-400'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              
              {/* Mobile Account Selector */}
              <div className="mt-4 px-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Account
                </label>
                <select
                  value={selectedAccountId || 'all'}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value === 'all' ? null : e.target.value);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 rounded-md bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Accounts</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
        
        {/* Main content */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-800 overflow-y-auto">
          <div className="container mx-auto px-4 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
