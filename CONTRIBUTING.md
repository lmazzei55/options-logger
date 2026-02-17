# Contributing to Options Trading Tracker

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/options-logger.git
   cd options-logger
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Start Development Server**
   ```bash
   pnpm dev
   ```

4. **Run Tests**
   ```bash
   pnpm test
   ```

## Branch Strategy

- `main` - Production-ready code
- `fix/*` - Bug fixes and improvements
- `feature/*` - New features
- `docs/*` - Documentation updates

## Development Workflow

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Write clean, readable code
   - Follow existing code style
   - Add comments for complex logic
   - Update tests as needed

3. **Test Your Changes**
   ```bash
   pnpm test        # Run tests
   pnpm build       # Verify build succeeds
   ```

4. **Commit**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

   **Commit Message Format:**
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test additions or changes
   - `refactor:` - Code refactoring
   - `style:` - Code style changes (formatting, etc.)
   - `chore:` - Build process or auxiliary tool changes

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a Pull Request on GitHub.

## Code Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Define interfaces for all data structures
- Avoid `any` type - use proper types or `unknown`
- Use meaningful variable and function names

### React

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use React.memo for performance optimization where appropriate

### Naming Conventions

- **Components**: PascalCase (e.g., `OptionsList.tsx`)
- **Functions**: camelCase (e.g., `calculateProfit`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)
- **Interfaces/Types**: PascalCase (e.g., `OptionTransaction`)

### File Organization

```
src/
├── components/     # Reusable UI components
├── pages/          # Page-level components
├── contexts/       # React contexts for state management
├── utils/          # Utility functions and helpers
│   ├── parsers/    # Broker statement parsers
│   └── ...
├── types/          # TypeScript type definitions
└── test/           # Test utilities and setup
```

## Adding a New Broker Parser

To add support for a new broker, follow these steps:

### 1. Create Parser File

Create a new file in `src/utils/parsers/`:

```typescript
// src/utils/parsers/YourBrokerParser.ts
import { BrokerParser, ParsedTransaction, ParsedOptionTransaction, ImportResult } from '../../types';

/**
 * Parser for [Broker Name] statements
 * 
 * Describe the statement format and what this parser handles.
 */
export class YourBrokerParser implements BrokerParser {
  name = 'Your Broker Name';
  id = 'your-broker-id';

  /**
   * Parse broker statement PDF text
   * @param pdfText - Raw text extracted from PDF
   * @returns ImportResult with parsed transactions, errors, and warnings
   */
  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Your parsing logic here
      // Extract transactions from pdfText
      
      return {
        success: transactions.length > 0 || optionTransactions.length > 0,
        transactions,
        optionTransactions,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Failed to parse statement: ${error}`);
      return { success: false, transactions: [], optionTransactions: [], errors, warnings };
    }
  }
}
```

### 2. Update Import Page

Add detection logic in `src/pages/Import.tsx`:

```typescript
import { YourBrokerParser } from '../utils/parsers/YourBrokerParser';

// In handleFileChange function, add:
if (text.includes('UNIQUE_BROKER_IDENTIFIER')) {
  const parser = new YourBrokerParser();
  const result = parser.parse(text);
  
  if (result.success) {
    // Handle parsed transactions
    setParsedTransactions(prev => [...prev, ...result.transactions]);
    setParsedOptionTransactions(prev => [...prev, ...result.optionTransactions]);
  }
  
  if (result.errors.length > 0) {
    setErrors(prev => [...prev, ...result.errors]);
  }
}
```

### 3. Test Your Parser

Create test cases:

```typescript
// src/utils/parsers/YourBrokerParser.test.ts
import { describe, it, expect } from 'vitest';
import { YourBrokerParser } from './YourBrokerParser';

describe('YourBrokerParser', () => {
  it('should parse valid statement', () => {
    const parser = new YourBrokerParser();
    const samplePdfText = '...'; // Sample statement text
    
    const result = parser.parse(samplePdfText);
    
    expect(result.success).toBe(true);
    expect(result.transactions.length).toBeGreaterThan(0);
  });

  it('should handle invalid format', () => {
    const parser = new YourBrokerParser();
    const invalidText = 'invalid data';
    
    const result = parser.parse(invalidText);
    
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

### 4. Document Your Parser

Update README.md with:
- Broker name and supported statement types
- Statement format requirements
- Any special considerations or limitations

## Testing Guidelines

### Unit Tests

- Test utility functions and parsers
- Use descriptive test names
- Cover edge cases and error conditions
- Mock external dependencies

```typescript
describe('calculateProfit', () => {
  it('should calculate profit for closed position', () => {
    const result = calculateProfit(/* params */);
    expect(result).toBe(expected);
  });

  it('should handle zero quantity', () => {
    const result = calculateProfit(/* params with zero qty */);
    expect(result).toBe(0);
  });
});
```

### Integration Tests

- Test component interactions
- Verify data flow through contexts
- Test user workflows

### Running Tests

```bash
# Run all tests in watch mode
pnpm test

# Run tests once
pnpm test:run

# Run tests with coverage
pnpm test:coverage
```

## Pull Request Process

1. **Update Documentation**
   - Update README.md if adding features
   - Add code comments for complex logic
   - Update CHANGELOG.md (if exists)

2. **Ensure Tests Pass**
   - All existing tests must pass
   - Add new tests for new functionality
   - Build must succeed

3. **Code Review**
   - Address reviewer feedback
   - Keep discussions professional and constructive
   - Be open to suggestions

4. **Merge**
   - Squash commits if requested
   - Ensure branch is up to date with main
   - Maintainer will merge when approved

## Reporting Issues

When reporting bugs, please include:

- **Description**: Clear description of the issue
- **Steps to Reproduce**: Detailed steps to reproduce the bug
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: Browser, OS, app version
- **Screenshots**: If applicable
- **Sample Files**: If related to parsing (remove sensitive data)

## Feature Requests

For feature requests, please include:

- **Use Case**: Why is this feature needed?
- **Proposed Solution**: How should it work?
- **Alternatives**: Other solutions you've considered
- **Additional Context**: Any other relevant information

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Questions?

If you have questions about contributing:

- Open an issue with the "question" label
- Check existing issues and discussions
- Review the README.md and documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Options Trading Tracker! 🎉
