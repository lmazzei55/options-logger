import { useRef, useState, useCallback, useEffect } from 'react';
import type {
  InvestmentAccount,
  StockTransaction,
  OptionTransaction,
  Tag,
  TransactionTemplate,
  AppSettings
} from '../types';

interface Snapshot {
  accounts: InvestmentAccount[];
  stockTransactions: StockTransaction[];
  optionTransactions: OptionTransaction[];
  tags: Tag[];
  templates: TransactionTemplate[];
  settings: AppSettings;
  selectedAccountId: string | null;
}

interface StateSetters {
  setAccounts: (v: InvestmentAccount[]) => void;
  setStockTransactions: (v: StockTransaction[]) => void;
  setOptionTransactions: (v: OptionTransaction[]) => void;
  setTags: (v: Tag[]) => void;
  setTemplates: (v: TransactionTemplate[]) => void;
  setSettings: (v: AppSettings) => void;
  setSelectedAccountId: (v: string | null) => void;
}

const MAX_HISTORY = 50;
// Debounce groups rapid mutations (e.g. closeOptionPosition adds option + stock txn)
const HISTORY_DEBOUNCE_MS = 150;

export function useHistory(current: Snapshot, setters: StateSetters) {
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const isRestoringRef = useRef(false);
  const isInitialMount = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<Snapshot | null>(null);

  // Counts to trigger re-renders when stacks change
  const [stackVersion, setStackVersion] = useState(0);

  const bumpVersion = useCallback(() => setStackVersion(v => v + 1), []);

  // Watch for state changes and push the pre-change snapshot to undo stack
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      pendingSnapshotRef.current = current;
      return;
    }
    if (isRestoringRef.current) {
      pendingSnapshotRef.current = current;
      return;
    }

    // Capture the pre-change snapshot on first change of a debounce group
    if (debounceRef.current === null) {
      pendingSnapshotRef.current = { ...current };
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (pendingSnapshotRef.current) {
        undoStack.current = [...undoStack.current, pendingSnapshotRef.current].slice(-MAX_HISTORY);
        redoStack.current = [];
        pendingSnapshotRef.current = current;
        bumpVersion();
      }
    }, HISTORY_DEBOUNCE_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current.accounts, current.stockTransactions, current.optionTransactions,
    current.tags, current.templates, current.settings, current.selectedAccountId
  ]);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    isRestoringRef.current = true;
    setters.setAccounts(snapshot.accounts);
    setters.setStockTransactions(snapshot.stockTransactions);
    setters.setOptionTransactions(snapshot.optionTransactions);
    setters.setTags(snapshot.tags);
    setters.setTemplates(snapshot.templates);
    setters.setSettings(snapshot.settings);
    setters.setSelectedAccountId(snapshot.selectedAccountId);
    // Allow the next effect run to see we're done restoring
    setTimeout(() => { isRestoringRef.current = false; }, 0);
  }, [setters]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [{ ...current }, ...redoStack.current].slice(0, MAX_HISTORY);
    applySnapshot(prev);
    bumpVersion();
  }, [current, applySnapshot, bumpVersion]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, { ...current }].slice(-MAX_HISTORY);
    applySnapshot(next);
    bumpVersion();
  }, [current, applySnapshot, bumpVersion]);

  return {
    undo,
    redo,
    canUndo: stackVersion >= 0 && undoStack.current.length > 0,
    canRedo: stackVersion >= 0 && redoStack.current.length > 0
  };
}
