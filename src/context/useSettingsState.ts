import { useReducer, useCallback } from 'react';
import type { Tag, TransactionTemplate, AppSettings } from '../types';
import { generateId } from '../utils/calculations';

// ==========================================
// Default settings
// ==========================================

export const defaultSettings: AppSettings = {
  theme: 'system',
  defaultCurrency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  showAllAccountsView: true,
  enablePriceFetching: false,
  adjustCostBasisWithPremiums: false,
  chartPreferences: {
    defaultTimeRange: '6M',
    defaultChartType: 'line'
  },
  taxRates: {
    shortTerm: 24,
    longTerm: 15
  }
};

// ==========================================
// Settings reducer
// ==========================================

type SettingsAction =
  | { type: 'UPDATE'; updates: Partial<AppSettings> }
  | { type: 'SET_ALL'; settings: AppSettings };

export function settingsReducer(state: AppSettings, action: SettingsAction): AppSettings {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, ...action.updates };
    case 'SET_ALL':
      return action.settings;
    default:
      return state;
  }
}

// ==========================================
// Tags reducer
// ==========================================

type TagAction =
  | { type: 'ADD'; tag: Omit<Tag, 'id'> }
  | { type: 'UPDATE'; id: string; updates: Partial<Tag> }
  | { type: 'DELETE'; id: string }
  | { type: 'SET_ALL'; tags: Tag[] };

export function tagReducer(state: Tag[], action: TagAction): Tag[] {
  switch (action.type) {
    case 'ADD':
      return [...state, { ...action.tag, id: generateId() }];
    case 'UPDATE':
      return state.map(t => t.id === action.id ? { ...t, ...action.updates } : t);
    case 'DELETE':
      return state.filter(t => t.id !== action.id);
    case 'SET_ALL':
      return action.tags;
    default:
      return state;
  }
}

// ==========================================
// Templates reducer
// ==========================================

type TemplateAction =
  | { type: 'ADD'; template: Omit<TransactionTemplate, 'id'> }
  | { type: 'UPDATE'; id: string; updates: Partial<TransactionTemplate> }
  | { type: 'DELETE'; id: string }
  | { type: 'SET_ALL'; templates: TransactionTemplate[] };

export function templateReducer(state: TransactionTemplate[], action: TemplateAction): TransactionTemplate[] {
  switch (action.type) {
    case 'ADD':
      return [...state, { ...action.template, id: generateId() }];
    case 'UPDATE':
      return state.map(t => t.id === action.id ? { ...t, ...action.updates } : t);
    case 'DELETE':
      return state.filter(t => t.id !== action.id);
    case 'SET_ALL':
      return action.templates;
    default:
      return state;
  }
}

// ==========================================
// React hook
// ==========================================

export function useSettingsState() {
  const [settings, settingsDispatch] = useReducer(settingsReducer, defaultSettings);
  const [tags, tagsDispatch] = useReducer(tagReducer, []);
  const [templates, templatesDispatch] = useReducer(templateReducer, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    settingsDispatch({ type: 'UPDATE', updates });
  }, []);

  const setSettings = useCallback((s: AppSettings) => {
    settingsDispatch({ type: 'SET_ALL', settings: s });
  }, []);

  const addTag = useCallback((tag: Omit<Tag, 'id'>) => {
    tagsDispatch({ type: 'ADD', tag });
  }, []);

  const updateTag = useCallback((id: string, updates: Partial<Tag>) => {
    tagsDispatch({ type: 'UPDATE', id, updates });
  }, []);

  const deleteTag = useCallback((id: string) => {
    tagsDispatch({ type: 'DELETE', id });
  }, []);

  const setTags = useCallback((tags: Tag[]) => {
    tagsDispatch({ type: 'SET_ALL', tags });
  }, []);

  const addTemplate = useCallback((template: Omit<TransactionTemplate, 'id'>) => {
    templatesDispatch({ type: 'ADD', template });
  }, []);

  const updateTemplate = useCallback((id: string, updates: Partial<TransactionTemplate>) => {
    templatesDispatch({ type: 'UPDATE', id, updates });
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    templatesDispatch({ type: 'DELETE', id });
  }, []);

  const setTemplates = useCallback((templates: TransactionTemplate[]) => {
    templatesDispatch({ type: 'SET_ALL', templates });
  }, []);

  return {
    settings,
    updateSettings,
    setSettings,
    tags,
    addTag,
    updateTag,
    deleteTag,
    setTags,
    templates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    setTemplates
  };
}
