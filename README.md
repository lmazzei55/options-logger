# Options Trading Tracker

A privacy-focused web application for tracking options and stock trades with automatic broker statement import functionality.

## Features

- **Multi-Broker Support**: Import transactions from Schwab monthly statements and Acorns statements
- **Privacy-First Design**: All PDF parsing happens client-side in your browser - no data is uploaded to any server
- **Comprehensive Tracking**: Track options trades (calls/puts) and stock positions
- **Automatic Calculations**: 
  - Real-time profit/loss calculations
  - FIFO-based position tracking for partial closes
  - 30-day wash sale detection
  - Fee tracking and inclusion in all calculations
- **Security Features**:
  - Input sanitization to prevent XSS attacks
  - Comprehensive test suite with 28+ security tests
  - All data processing happens client-side
- **Data Management**: Export/import your data as JSON for backup and portability
- **Dark Mode UI**: Modern, responsive interface with left sidebar navigation
- **Transaction Management**: Add, edit, and delete transactions manually or via import

## Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **PDF Processing**: pdfjs-dist (client-side parsing)
- **Testing**: Vitest with React Testing Library
- **Data Storage**: Browser LocalStorage

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: 22.13.0)
- pnpm (or npm/yarn)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/lmazzei55/options-logger.git
cd options-logger
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm dev
```

4. Open your browser to `http://localhost:5173`

### Building for Production

```bash
pnpm build
```

The built files will be in the `dist/` directory.

### Running Tests

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run
```

## Usage Guide

### Importing Broker Statements

#### Schwab Monthly Statements (Options)

1. Download your monthly statement PDF from Schwab
2. Navigate to the **Import** page in the app
3. Click "Choose Files" and select one or more Schwab monthly statement PDFs
4. The app will automatically:
   - Extract options transactions
   - Detect action types (sell-to-open, buy-to-open, buy-to-close, sell-to-close)
   - Include all fees in calculations
   - Handle multiple transactions per date
   - Handle page breaks in PDFs

5. Review the parsed transactions in the preview table
6. Click "Import Transactions" to add them to your tracker

**Supported Schwab Statement Format:**
- Monthly statements with "Options" section
- Transaction format: Date, Action, Symbol, Quantity, Price, Fees, Amount
- Handles multi-line transactions that span page breaks

#### Acorns Statements (Stocks)

1. Download your statement PDF from Acorns
2. Navigate to the **Import** page
3. Click "Choose Files" and select one or more Acorns statement PDFs
4. The app will extract stock buy/sell transactions
5. Review and import as above

### Manual Transaction Entry

#### Adding an Options Trade

1. Navigate to **Options** page
2. Click "Add Option Trade"
3. Fill in the form:
   - **Ticker**: Stock symbol (e.g., AAPL)
   - **Type**: Call or Put
   - **Strike Price**: Option strike price
   - **Expiration Date**: Option expiration date
   - **Action**: 
     - `sell-to-open`: Opening a short position (selling to open)
     - `buy-to-open`: Opening a long position (buying to open)
     - `sell-to-close`: Closing a long position (selling to close)
     - `buy-to-close`: Closing a short position (buying to close)
   - **Quantity**: Number of contracts
   - **Premium**: Price per contract
   - **Fees**: Total fees for the transaction
   - **Date**: Transaction date
   - **Account**: Account name (optional)
   - **Notes**: Additional notes (optional)

4. Click "Add Trade"

#### Adding a Stock Trade

1. Navigate to **Stocks** page
2. Click "Add Stock Trade"
3. Fill in the form (similar to options, but without strike/expiration/type)
4. Click "Add Trade"

### Data Backup and Restore

#### Export Data

1. Navigate to **Settings** page
2. Click "Export Data"
3. A JSON file will be downloaded with all your transactions

#### Import Data

1. Navigate to **Settings** page
2. Click "Import Data"
3. Select a previously exported JSON file
4. Your data will be restored

**Note**: Importing data will merge with existing data, not replace it.

### Viewing Reports

The **Dashboard** page provides:
- Total realized P/L
- Total unrealized P/L
- Open positions summary
- Recent transactions
- Performance charts (coming soon)

## Broker Statement Parsing

### Architecture

The app uses a modular parser system located in `src/utils/parsers/`:

```
src/utils/parsers/
├── SchwabMonthlyParser.ts   # Schwab monthly statement parser
├── AcornsParser.ts           # Acorns statement parser
└── [Future parsers]          # Add more broker parsers here
```

### Adding a New Broker Parser

To add support for a new broker:

1. **Create a new parser file** in `src/utils/parsers/`:

```typescript
// src/utils/parsers/NewBrokerParser.ts
import * as pdfjsLib from 'pdfjs-dist';

export interface ParsedTransaction {
  ticker: string;
  type?: 'call' | 'put';
  strikePrice?: number;
  expirationDate?: string;
  action: 'buy-to-open' | 'sell-to-open' | 'buy-to-close' | 'sell-to-close' | 'buy' | 'sell';
  quantity: number;
  premium: number;
  fees: number;
  date: string;
  account?: string;
  notes?: string;
}

export class NewBrokerParser {
  async parse(file: File): Promise<ParsedTransaction[]> {
    // Load PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const transactions: ParsedTransaction[] = [];
    
    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      // Parse transactions from text
      // ... your parsing logic here ...
    }
    
    return transactions;
  }
}
```

2. **Update the Import page** to use your parser:

```typescript
// src/pages/Import.tsx
import { NewBrokerParser } from '../utils/parsers/NewBrokerParser';

// In the handleFileChange function, add detection logic:
if (text.includes('NEW BROKER IDENTIFIER')) {
  const parser = new NewBrokerParser();
  const parsed = await parser.parse(file);
  // ... handle parsed transactions
}
```

### Parser API Reference

**ParsedTransaction Interface:**
- `ticker` (required): Stock symbol
- `type` (optional): 'call' or 'put' for options
- `strikePrice` (optional): Strike price for options
- `expirationDate` (optional): Expiration date for options (ISO format)
- `action` (required): Transaction action type
- `quantity` (required): Number of contracts/shares
- `premium` (required): Price per contract/share
- `fees` (required): Total fees for the transaction
- `date` (required): Transaction date (ISO format)
- `account` (optional): Account name
- `notes` (optional): Additional notes

**Action Types:**
- Options: `sell-to-open`, `buy-to-open`, `sell-to-close`, `buy-to-close`
- Stocks: `buy`, `sell`

## Project Structure

```
src/
├── components/          # Reusable React components
│   ├── Layout.tsx      # Main layout with sidebar
│   └── ...
├── contexts/           # React contexts
│   └── AppContext.tsx  # Main app state and data management
├── pages/              # Page components
│   ├── Dashboard.tsx   # Dashboard/home page
│   ├── Options.tsx     # Options tracking page
│   ├── Stocks.tsx      # Stock tracking page
│   ├── Import.tsx      # Broker statement import page
│   └── Settings.tsx    # Settings and data management
├── utils/              # Utility functions
│   ├── parsers/        # Broker statement parsers
│   ├── calculations.ts # P/L and position calculations
│   └── ...
└── types/              # TypeScript type definitions
```

## Security

This application includes comprehensive security measures:

- **Input Sanitization**: All user inputs are sanitized to prevent XSS attacks
  - HTML tags are stripped from all text inputs
  - JavaScript protocols and event handlers are blocked
  - Input length limits prevent buffer overflow attacks
- **Comprehensive Testing**: 28+ security tests ensure sanitization works correctly
- **Client-Side Only**: No data is ever sent to external servers

## Data Privacy

This application is designed with privacy as a top priority:

- **No Server Uploads**: All PDF parsing happens in your browser using pdfjs-dist
- **Local Storage Only**: Your data is stored in your browser's LocalStorage
- **No Analytics**: No tracking or analytics code
- **No External API Calls**: All calculations happen client-side
- **Export Control**: You control your data - export it anytime as JSON

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run tests: `pnpm test`
4. Build to verify: `pnpm build`
5. Commit with descriptive messages
6. Push and create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

## Roadmap

- [ ] Additional broker support (TD Ameritrade, E*TRADE, etc.)
- [ ] Advanced filtering and search
- [ ] Performance charts and analytics
- [ ] Tax reporting features
- [ ] Mobile app version
- [ ] Cloud sync option (optional, privacy-preserving)

---

**Built with ❤️ for options traders who value privacy**
