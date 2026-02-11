// import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Stocks from './pages/Stocks';
import Options from './pages/Options';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Analytics from './pages/Analytics';
import Taxes from './pages/Taxes';
import Settings from './pages/Settings';

function App() {
  return (
    <AppProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stocks" element={<Stocks />} />
            <Route path="/options" element={<Options />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/taxes" element={<Taxes />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Layout>
      </Router>
    </AppProvider>
  );
}

export default App;
