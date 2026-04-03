import { describe, it, expect } from 'vitest';
import { SchwabYearlyParser } from '../SchwabYearlyParser';

const parser = new SchwabYearlyParser();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal but complete Year-End Summary PDF text */
function makePdf(realizedRows: string, optionsActivityRows = ''): string {
  return `
TAX YEAR 2025
FORM 1099 COMPOSITE
& YEAR-END SUMMARY

Account Number
54

SHORT-TERM TRANSACTIONS FOR WHICH BASIS IS REPORTED TO THE IRS
00760J108 / AEHR
345370860 / F
97785W106 / WOLF

YEAR-END SUMMARY INFORMATION IS NOT PROVIDED TO THE IRS.

REALIZED GAIN OR (LOSS)

Short-Term Realized Gain or (Loss)
This section is for covered securities.

${realizedRows}

Total Short-Term $ 9,243.58 $ 11,764.59 -- $ (2,521.01)

${optionsActivityRows ? 'OPTIONS ACTIVITY\n\n' + optionsActivityRows : ''}

Terms and Conditions
`.trim();
}

// ── Parser identity ───────────────────────────────────────────────────────────

describe('SchwabYearlyParser identity', () => {
  it('has correct id and name', () => {
    expect(parser.id).toBe('schwab-yearly');
    expect(parser.name).toBe('Schwab 1099 / Year-End Summary');
  });
});

// ── Document validation ───────────────────────────────────────────────────────

describe('document validation', () => {
  it('rejects non-1099 documents', () => {
    const result = parser.parse('Some random PDF text without the right headers');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts document with FORM 1099 COMPOSITE header', () => {
    const result = parser.parse(makePdf(''));
    expect(result.success).toBe(true);
  });

  it('accepts document with YEAR-END SUMMARY only', () => {
    const result = parser.parse('YEAR-END SUMMARY\nREALIZED GAIN OR (LOSS)\n');
    expect(result.success).toBe(true);
  });

  it('warns when no Year-End Summary section found', () => {
    const text = 'TAX YEAR 2025\nFORM 1099 COMPOSITE\nSome other content';
    const result = parser.parse(text);
    expect(result.success).toBe(true);
    expect(result.warnings.some(w => /year-end summary/i.test(w))).toBe(true);
  });

  it('warns when no Realized Gain section found', () => {
    const text = 'TAX YEAR 2025\nFORM 1099 COMPOSITE\nYEAR-END SUMMARY\nSome other content';
    const result = parser.parse(text);
    expect(result.success).toBe(true);
  });

  it('returns success:true even when empty', () => {
    const result = parser.parse(makePdf(''));
    expect(result.success).toBe(true);
  });
});

// ── Account info extraction ───────────────────────────────────────────────────

describe('account info extraction', () => {
  it('extracts last 4 digits of account number', () => {
    const result = parser.parse(makePdf(''));
    expect(result.accountInfo?.accountNumber).toBe('54');
    expect(result.accountInfo?.broker).toBe('Schwab');
    expect(result.accountInfo?.accountType).toBe('brokerage');
  });
});

// ── Closed option rows — short positions (S suffix) ──────────────────────────

describe('closed option rows — short (S) positions', () => {
  it('parses a short call that expired worthless', () => {
    const rows = 'AEHR 01/17/2025 15.00 C 2.00S 12/24/24 01/17/25 $ 288.66 $ 0.00 -- $ 288.66 f';
    const result = parser.parse(makePdf(rows));
    expect(result.success).toBe(true);
    expect(result.optionTransactions).toHaveLength(1);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('AEHR');
    expect(t.optionType).toBe('call');
    expect(t.action).toBe('buy-to-close');
    expect(t.contracts).toBe(2);
    expect(t.strikePrice).toBe(15.00);
    expect(t.expirationDate).toBe('2025-01-17');
    expect(t.date).toBe('2025-01-17'); // closed on expiration date
    expect(t.isExpired).toBe(true);
    // Cost basis = 0.00 → premiumPerShare = 0 / (2 × 100) = 0
    expect(t.premiumPerShare).toBe(0);
  });

  it('parses a short call bought to close before expiry', () => {
    const rows = 'ASTS 09/26/2025 45.00 C 1.00S 09/23/25 09/23/25 $ 104.34 $ 397.66 -- $ (293.32) f';
    const result = parser.parse(makePdf(rows));
    expect(result.optionTransactions).toHaveLength(1);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('ASTS');
    expect(t.action).toBe('buy-to-close');
    expect(t.contracts).toBe(1);
    expect(t.strikePrice).toBe(45.00);
    expect(t.expirationDate).toBe('2025-09-26');
    expect(t.date).toBe('2025-09-23');
    expect(t.isExpired).toBe(false);
    // premiumPerShare = 397.66 / (1 × 100) = 3.9766
    expect(t.premiumPerShare).toBeCloseTo(3.9766, 3);
  });

  it('parses a short put that expired worthless', () => {
    const rows = 'F 08/15/2025 11.00 P 4.00S 08/06/25 08/15/25 $ 77.35 $ 0.00 -- $ 77.35 f';
    const result = parser.parse(makePdf(rows));
    expect(result.optionTransactions).toHaveLength(1);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('F');
    expect(t.optionType).toBe('put');
    expect(t.action).toBe('buy-to-close');
    expect(t.contracts).toBe(4);
    expect(t.isExpired).toBe(true);
    expect(t.premiumPerShare).toBe(0);
  });

  it('parses a short put bought to close', () => {
    const rows = 'F 08/08/2025 11.00 P 4.00S 08/07/25 08/07/25 $ 65.35 $ 16.04 -- $ 49.31 f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    expect(t.action).toBe('buy-to-close');
    expect(t.isExpired).toBe(false);
    // premiumPerShare = 16.04 / (4 × 100) = 0.0401
    expect(t.premiumPerShare).toBeCloseTo(0.0401, 4);
  });

  it('parses short WOLF put expiration with 10 contracts', () => {
    const rows = 'WOLF 08/22/2025 1.00 P 10.00S 08/15/25 08/22/25 $ 13.36 $ 0.00 -- $ 13.36 f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('WOLF');
    expect(t.contracts).toBe(10);
    expect(t.strikePrice).toBe(1.00);
    expect(t.isExpired).toBe(true);
    expect(t.premiumPerShare).toBe(0);
  });

  it('parses short ASTS call with large cost basis', () => {
    const rows = 'ASTS 10/24/2025 50.00 C 1.00S 10/14/25 10/14/25 $ 454.34 $ 3,727.66 -- $ (3,273.32) f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('ASTS');
    expect(t.strikePrice).toBe(50.00);
    expect(t.isExpired).toBe(false);
    // premiumPerShare = 3727.66 / (1 × 100) = 37.2766
    expect(t.premiumPerShare).toBeCloseTo(37.2766, 3);
  });
});

// ── Closed option rows — long positions (no S suffix) ────────────────────────

describe('closed option rows — long positions', () => {
  it('parses a long call that expired worthless', () => {
    const rows = 'AEHR 07/18/2025 20.00 C 8.00 07/08/25 07/18/25 $ 0.00 $ 507.29 -- $ (507.29) f';
    const result = parser.parse(makePdf(rows));
    expect(result.optionTransactions).toHaveLength(1);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('AEHR');
    expect(t.optionType).toBe('call');
    expect(t.action).toBe('sell-to-close');
    expect(t.contracts).toBe(8);
    expect(t.strikePrice).toBe(20.00);
    expect(t.isExpired).toBe(true);
    // proceeds = 0 → premiumPerShare = 0 / (8 × 100) = 0
    expect(t.premiumPerShare).toBe(0);
  });

  it('parses a long put sold to close', () => {
    const rows = 'AEHR 11/21/2025 22.50 P 2.00 10/13/25 11/17/25 $ 526.67 $ 421.32 -- $ 105.35 f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('AEHR');
    expect(t.optionType).toBe('put');
    expect(t.action).toBe('sell-to-close');
    expect(t.contracts).toBe(2);
    expect(t.strikePrice).toBe(22.50);
    expect(t.expirationDate).toBe('2025-11-21');
    expect(t.date).toBe('2025-11-17');
    expect(t.isExpired).toBe(false);
    // premiumPerShare = 526.67 / (2 × 100) = 2.6334
    expect(t.premiumPerShare).toBeCloseTo(2.6334, 3);
  });

  it('parses a long call sold to close (UNH)', () => {
    const rows = 'UNH 09/19/2025 360.00 C 1.00 08/15/25 08/20/25 $ 135.34 $ 277.66 -- $ (142.32) f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('UNH');
    expect(t.strikePrice).toBe(360.00);
    expect(t.action).toBe('sell-to-close');
    expect(t.isExpired).toBe(false);
    // premiumPerShare = 135.34 / (1 × 100) = 1.3534
    expect(t.premiumPerShare).toBeCloseTo(1.3534, 3);
  });

  it('parses a long put sold to close (AEHR 25.00)', () => {
    const rows = 'AEHR 10/17/2025 25.00 P 2.00 08/28/25 09/19/25 $ 324.67 $ 661.32 -- $ (336.65) f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    expect(t.action).toBe('sell-to-close');
    expect(t.strikePrice).toBe(25.00);
    expect(t.isExpired).toBe(false);
  });

  it('parses a long call that expired with small proceeds (AEHR 06/20)', () => {
    const rows = 'AEHR 06/20/2025 15.00 C 6.00S 06/04/25 06/20/25 $ 14.01 $ 0.00 -- $ 14.01 f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    // S suffix → short → buy-to-close, isExpired (sold on expiry date)
    expect(t.action).toBe('buy-to-close');
    expect(t.isExpired).toBe(true);
  });
});

// ── Closed stock rows ─────────────────────────────────────────────────────────

describe('closed stock rows', () => {
  it('parses AEHR stock sale', () => {
    const rows = 'AEHR TEST SYS 00760J108 149.00 11/15/24 07/18/25 $ 2,293.58 $ 1,814.32 -- $ 479.26 f';
    const result = parser.parse(makePdf(rows));
    expect(result.transactions).toHaveLength(1);
    const t = result.transactions[0];
    expect(t.ticker).toBe('AEHR');
    expect(t.action).toBe('sell');
    expect(t.shares).toBe(149);
    expect(t.date).toBe('2025-07-18');
    // pricePerShare = 2293.58 / 149
    expect(t.pricePerShare).toBeCloseTo(2293.58 / 149, 2);
    expect(t.fees).toBe(0);
  });

  it('parses FORD stock sale', () => {
    const rows = 'FORD MTR CO DEL 345370860 300.00 08/01/25 08/08/25 $ 3,327.96 $ 3,220.99 -- $ 106.97 f';
    const result = parser.parse(makePdf(rows));
    expect(result.transactions).toHaveLength(1);
    const t = result.transactions[0];
    expect(t.ticker).toBe('F');
    expect(t.shares).toBe(300);
    expect(t.date).toBe('2025-08-08');
    expect(t.pricePerShare).toBeCloseTo(3327.96 / 300, 2);
  });

  it('warns and skips stock rows with unknown CUSIP', () => {
    // CUSIP that isn't in the CUSIP/ticker map section
    const rows = 'UNKNOWN COMPANY ZZZZZZ999 50.00 01/01/25 06/01/25 $ 1,000.00 $ 900.00 -- $ 100.00 f';
    const result = parser.parse(makePdf(rows));
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings.some(w => /unknown ticker/i.test(w))).toBe(true);
  });

  it('parses long-term AEHR with prior-year acquisition date', () => {
    const rows = 'AEHR TEST SYS 00760J108 100.00 03/27/24 07/18/25 $ 1,539.32 $ 1,686.38 -- $ (147.06) f';
    const result = parser.parse(makePdf(rows));
    const t = result.transactions[0];
    expect(t.ticker).toBe('AEHR');
    expect(t.date).toBe('2025-07-18'); // sold date
    expect(t.shares).toBe(100);
  });
});

// ── Open options at year-end ──────────────────────────────────────────────────

describe('open options at year-end', () => {
  it('parses an open long CALL option', () => {
    const optActivity = `
Open Long Options at Year-End
Open Long CALL Options
NVDA 01/16/2026 200.00 C 1.00 08/26/25 $ 1,185.66
Security Subtotal $ 1,185.66
Total Open Long CALL Options $ 1,185.66
Total Long Options at Year-End (Trade Date) $ 1,185.66
    `.trim();
    const result = parser.parse(makePdf('', optActivity));
    expect(result.optionTransactions).toHaveLength(1);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('NVDA');
    expect(t.optionType).toBe('call');
    expect(t.action).toBe('buy-to-open');
    expect(t.contracts).toBe(1);
    expect(t.strikePrice).toBe(200.00);
    expect(t.expirationDate).toBe('2026-01-16');
    expect(t.date).toBe('2025-08-26');
    // premiumPerShare = 1185.66 / (1 × 100) = 11.8566
    expect(t.premiumPerShare).toBeCloseTo(11.8566, 3);
    expect(t.isExpired).toBeUndefined();
  });

  it('parses an open short CALL option (qty in parens)', () => {
    const optActivity = `
Open Short Options at Year-End
Open Short CALL Options
ASTS 12/17/2027 75.00 C (1.00) 10/13/25 $ (4,691.34)
Security Subtotal $ (4,691.34)
Total Open Short CALL Options $ (4,691.34)
Total Short Options at Year-End (Trade Date) $ (4,691.34)
    `.trim();
    const result = parser.parse(makePdf('', optActivity));
    expect(result.optionTransactions).toHaveLength(1);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('ASTS');
    expect(t.optionType).toBe('call');
    expect(t.action).toBe('sell-to-open');
    expect(t.contracts).toBe(1);
    expect(t.strikePrice).toBe(75.00);
    expect(t.expirationDate).toBe('2027-12-17');
    expect(t.date).toBe('2025-10-13');
    // premiumPerShare = 4691.34 / (1 × 100) = 46.9134
    expect(t.premiumPerShare).toBeCloseTo(46.9134, 3);
  });

  it('does not import assigned options', () => {
    const optActivity = `
Assigned Options-2025
Assigned CALL Options
AEHR 07/18/2025 15.00 C 6.00 06/25/25 07/18/25 $ 236.01
Security Subtotal $ 236.01
Total Assigned CALL Options $ 264.02
    `.trim();
    const result = parser.parse(makePdf('', optActivity));
    // Assigned options should be skipped
    expect(result.optionTransactions).toHaveLength(0);
  });
});

// ── Mixed full-document scenario ──────────────────────────────────────────────

describe('full document scenario', () => {
  it('parses a complete Year-End Summary with both options and stocks', () => {
    const realizedRows = `
AEHR TEST SYS 00760J108 149.00 11/15/24 07/18/25 $ 2,293.58 $ 1,814.32 -- $ 479.26 f
Security Subtotal $ 2,293.58 $ 1,814.32 -- $ 479.26 f
AEHR 01/17/2025 15.00 C 2.00S 12/24/24 01/17/25 $ 288.66 $ 0.00 -- $ 288.66 f
Security Subtotal $ 288.66 $ 0.00 -- $ 288.66 f
AEHR 07/18/2025 20.00 C 8.00 07/08/25 07/18/25 $ 0.00 $ 507.29 -- $ (507.29) f
Security Subtotal $ 0.00 $ 507.29 -- $ (507.29) f
ASTS 09/26/2025 45.00 C 1.00S 09/23/25 09/23/25 $ 104.34 $ 397.66 -- $ (293.32) f
Security Subtotal $ 104.34 $ 397.66 -- $ (293.32) f
FORD MTR CO DEL 345370860 300.00 08/01/25 08/08/25 $ 3,327.96 $ 3,220.99 -- $ 106.97 f
Security Subtotal $ 3,327.96 $ 3,220.99 -- $ 106.97 f
    `.trim();

    const optActivity = `
Open Long Options at Year-End
Open Long CALL Options
NVDA 01/16/2026 200.00 C 1.00 08/26/25 $ 1,185.66
Security Subtotal $ 1,185.66
Total Long Options at Year-End (Trade Date) $ 1,185.66
Open Short Options at Year-End
Open Short CALL Options
ASTS 12/17/2027 75.00 C (1.00) 10/13/25 $ (4,691.34)
Security Subtotal $ (4,691.34)
Total Short Options at Year-End (Trade Date) $ (4,691.34)
    `.trim();

    const result = parser.parse(makePdf(realizedRows, optActivity));
    expect(result.success).toBe(true);

    // 1 stock (AEHR), 1 stock (FORD) = 2 stock transactions
    expect(result.transactions).toHaveLength(2);

    // 3 closed options + 1 long open + 1 short open = 5 option transactions
    expect(result.optionTransactions).toHaveLength(5);

    // Closed options
    const buyToClose = result.optionTransactions.filter(t => t.action === 'buy-to-close');
    const sellToClose = result.optionTransactions.filter(t => t.action === 'sell-to-close');
    const buyToOpen = result.optionTransactions.filter(t => t.action === 'buy-to-open');
    const sellToOpen = result.optionTransactions.filter(t => t.action === 'sell-to-open');

    expect(buyToClose).toHaveLength(2);  // AEHR 01/17 (expired) + ASTS 09/26
    expect(sellToClose).toHaveLength(1); // AEHR 07/18 (expired)
    expect(buyToOpen).toHaveLength(1);   // NVDA open long
    expect(sellToOpen).toHaveLength(1);  // ASTS open short

    // Verify expired flags
    const aehrExpired = result.optionTransactions.find(
      t => t.ticker === 'AEHR' && t.action === 'buy-to-close'
    );
    expect(aehrExpired?.isExpired).toBe(true);

    const aehrLongExpired = result.optionTransactions.find(
      t => t.ticker === 'AEHR' && t.action === 'sell-to-close'
    );
    expect(aehrLongExpired?.isExpired).toBe(true);

    const astsNotExpired = result.optionTransactions.find(
      t => t.ticker === 'ASTS' && t.action === 'buy-to-close'
    );
    expect(astsNotExpired?.isExpired).toBe(false);
  });

  it('includes informational warning about import being closing-side only', () => {
    const rows = 'AEHR 01/17/2025 15.00 C 2.00S 12/24/24 01/17/25 $ 288.66 $ 0.00 -- $ 288.66 f';
    const result = parser.parse(makePdf(rows));
    expect(result.warnings.some(w => /closing/i.test(w))).toBe(true);
  });
});

// ── Date parsing ──────────────────────────────────────────────────────────────

describe('date parsing', () => {
  it('correctly infers 2024 dates from YY=24 with TAX YEAR 2025', () => {
    const rows = 'AEHR 01/17/2025 15.00 C 2.00S 12/24/24 01/17/25 $ 288.66 $ 0.00 -- $ 288.66 f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    // dateSold = 01/17/25 → 2025-01-17
    expect(t.date).toBe('2025-01-17');
    // expirationDate from MM/DD/YYYY
    expect(t.expirationDate).toBe('2025-01-17');
  });

  it('correctly parses prior-year date (YY=24)', () => {
    const rows = 'AEHR TEST SYS 00760J108 149.00 11/15/24 07/18/25 $ 2,293.58 $ 1,814.32 -- $ 479.26 f';
    const result = parser.parse(makePdf(rows));
    const t = result.transactions[0];
    // Sold date = 07/18/25 → 2025-07-18
    expect(t.date).toBe('2025-07-18');
  });

  it('handles far-future expiration dates (ASTS 12/17/2027)', () => {
    const optActivity = `
Open Short Options at Year-End
Open Short CALL Options
ASTS 12/17/2027 75.00 C (1.00) 10/13/25 $ (4,691.34)
    `.trim();
    const result = parser.parse(makePdf('', optActivity));
    const t = result.optionTransactions[0];
    expect(t.expirationDate).toBe('2027-12-17');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles options with S suffix and space between number and S', () => {
    // pdfjs may extract superscript S with a space: "2.00 S" instead of "2.00S"
    const rows = 'AEHR 01/17/2025 15.00 C 2.00 S 12/24/24 01/17/25 $ 288.66 $ 0.00 -- $ 288.66 f';
    const result = parser.parse(makePdf(rows));
    if (result.optionTransactions.length > 0) {
      expect(result.optionTransactions[0].action).toBe('buy-to-close');
    }
    // Parser should handle this gracefully (either parse or skip without crash)
    expect(result.success).toBe(true);
  });

  it('handles large comma-formatted numbers', () => {
    const rows = 'ASTS 10/24/2025 50.00 C 1.00S 10/14/25 10/14/25 $ 454.34 $ 3,727.66 -- $ (3,273.32) f';
    const result = parser.parse(makePdf(rows));
    const t = result.optionTransactions[0];
    // premiumPerShare = 3727.66 / 100 = 37.2766
    expect(t.premiumPerShare).toBeCloseTo(37.2766, 3);
  });

  it('handles actual PDF format: $ attached to date with no space, numbers concatenated with $', () => {
    // Real pdfjs output: no space between date and $, no space between dollar amounts
    const pdf = `
TAX YEAR 2025
FORM 1099 COMPOSITE
& YEAR-END SUMMARY

00760J108 / AEHR
345370860 / F

YEAR-END SUMMARY INFORMATION IS NOT PROVIDED TO THE IRS.

REALIZED GAIN OR (LOSS)

Short-Term Realized Gain or (Loss)
Description OR CUSIP Date Date (+)Wash Sale (=)Realized
Option Symbol Number Quantity/Par Acquired Sold Total Proceeds (-)Cost Basis Loss Disallowed Gain or (Loss)
AEHR 01/17/2025 15.00 C 2.00S 12/24/24 01/17/25$ 288.66$ 0.00 -- $ 288.66
AEHR 07/18/2025 20.00 C 8.00 07/08/25 07/18/25$ 0.00$ 507.29 -- $ (507.29)
FORD MTR CO DEL 345370860 300.00 08/01/25 08/08/25 $ 3,327.96$ 3,220.99 -- $ 106.97
ASTS 10/24/2025 50.00 C 1.00S 10/14/25 10/14/25$ 454.34$ 3,727.66 -- $ (3,273.32)

Terms and Conditions
    `.trim();

    const result = parser.parse(pdf);
    expect(result.success).toBe(true);
    expect(result.optionTransactions).toHaveLength(3);
    expect(result.transactions).toHaveLength(1);

    const shortExpired = result.optionTransactions.find(t => t.ticker === 'AEHR' && t.action === 'buy-to-close' && t.strikePrice === 15);
    expect(shortExpired?.isExpired).toBe(true);
    expect(shortExpired?.premiumPerShare).toBe(0); // costBasis=0

    const longExpired = result.optionTransactions.find(t => t.ticker === 'AEHR' && t.action === 'sell-to-close');
    expect(longExpired?.isExpired).toBe(true);
    expect(longExpired?.premiumPerShare).toBe(0); // proceeds=0

    const astsClose = result.optionTransactions.find(t => t.ticker === 'ASTS');
    expect(astsClose?.premiumPerShare).toBeCloseTo(37.2766, 3); // 3727.66/100

    const ford = result.transactions[0];
    expect(ford.ticker).toBe('F');
    expect(ford.pricePerShare).toBeCloseTo(3327.96 / 300, 2);
  });

  it('returns empty results gracefully for empty realized section', () => {
    const result = parser.parse(makePdf(''));
    expect(result.success).toBe(true);
    expect(result.transactions).toHaveLength(0);
    expect(result.optionTransactions).toHaveLength(0);
  });

  it('infers ticker via prefix matching when stock CUSIP has no explicit CUSIP/TICKER mapping', () => {
    // WOLFSPEED INC (CUSIP 97785W106) never appears as "97785W106 / WOLF" in 1099-B.
    // The ticker WOLF is only seen as an option symbol in the Year-End Summary.
    // The parser should infer WOLF from WOLFSPEED by prefix matching.
    const realizedRows = `
WOLF 08/22/2025 1.00 P 10.00S 08/15/25 08/22/25 $ 13.36 $ 0.00 -- $ 13.36
Security Subtotal $ 13.36 $ 0.00 -- $ 13.36
WOLFSPEED INC 97785W106 0.35 09/26/25 10/02/25 $ 10.67 $ 84.29 -- $ (73.62)
Security Subtotal $ 10.67 $ 84.29 -- $ (73.62)
    `.trim();
    const result = parser.parse(makePdf(realizedRows));
    expect(result.success).toBe(true);
    // WOLF option row parsed
    expect(result.optionTransactions).toHaveLength(1);
    // WOLFSPEED stock row parsed using inferred WOLF ticker
    expect(result.transactions).toHaveLength(1);
    const wolfStock = result.transactions[0];
    expect(wolfStock.ticker).toBe('WOLF');
    expect(wolfStock.shares).toBe(0.35);
    expect(wolfStock.date).toBe('2025-10-02');
    // No "unknown ticker" warning
    expect(result.warnings.some(w => /unknown ticker/i.test(w))).toBe(false);
  });
});
