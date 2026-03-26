/**
 * Data Migration System
 *
 * Each migration transforms data from version N to version N+1.
 * Migrations are applied sequentially on load when the stored
 * schema version is behind CURRENT_SCHEMA_VERSION.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export interface StoredData {
  schemaVersion?: number;
  accounts?: unknown[];
  stockTransactions?: unknown[];
  optionTransactions?: unknown[];
  tags?: unknown[];
  templates?: unknown[];
  settings?: Record<string, unknown>;
  selectedAccountId?: string | null;
  [key: string]: unknown;
}

type MigrationFn = (data: StoredData) => StoredData;

/**
 * Registry of migrations. Key is the version being migrated FROM.
 * e.g., migrations[1] migrates from version 1 to version 2.
 */
const migrations: Record<number, MigrationFn> = {
  // Example for future use:
  // 1: (data) => {
  //   // Migrate from v1 to v2: rename StockTransaction.date to .transactionDate
  //   const stockTxns = (data.stockTransactions || []) as Record<string, unknown>[];
  //   data.stockTransactions = stockTxns.map(txn => {
  //     if ('date' in txn && !('transactionDate' in txn)) {
  //       const { date, ...rest } = txn;
  //       return { ...rest, transactionDate: date };
  //     }
  //     return txn;
  //   });
  //   return data;
  // },
};

/**
 * Apply all pending migrations to stored data.
 * Returns the migrated data with schemaVersion set to CURRENT_SCHEMA_VERSION.
 */
export function applyMigrations(data: StoredData): StoredData {
  let currentVersion = data.schemaVersion ?? 0;
  let migratedData = { ...data };

  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const migrationFn = migrations[currentVersion];
    if (migrationFn) {
      try {
        migratedData = migrationFn(migratedData);
      } catch (error) {
        console.error(`Migration from v${currentVersion} to v${currentVersion + 1} failed:`, error);
        break;
      }
    }
    currentVersion++;
  }

  migratedData.schemaVersion = CURRENT_SCHEMA_VERSION;
  return migratedData;
}
