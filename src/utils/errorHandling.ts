/**
 * Consistent Error Handling Utilities
 * 
 * Provides standardized error handling across the application
 */

export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

/**
 * Error codes for different types of errors
 */
export const ErrorCodes = {
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TICKER: 'INVALID_TICKER',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  
  // Import errors
  IMPORT_FAILED: 'IMPORT_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  PDF_READ_FAILED: 'PDF_READ_FAILED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  
  // Data errors
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  POSITION_NOT_FOUND: 'POSITION_NOT_FOUND',
  INSUFFICIENT_POSITION: 'INSUFFICIENT_POSITION',
  
  // Storage errors
  STORAGE_FAILED: 'STORAGE_FAILED',
  EXPORT_FAILED: 'EXPORT_FAILED',
  
  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

/**
 * Creates a standardized error object
 */
export function createError(
  code: string,
  message: string,
  details?: any
): AppError {
  return {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Formats an error for display to the user
 */
export function formatErrorMessage(error: AppError | Error | unknown): string {
  if (!error) return 'An unknown error occurred';
  
  if (typeof error === 'string') return error;
  
  if ('message' in (error as any)) {
    return (error as any).message;
  }
  
  return 'An unknown error occurred';
}

/**
 * Logs an error with consistent formatting
 */
export function logError(error: AppError | Error | unknown, context?: string): void {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}]` : '';
  
  console.error(`${timestamp} ${contextStr} Error:`, error);
}

/**
 * Handles an error with logging and optional user notification
 */
export function handleError(
  error: AppError | Error | unknown,
  context?: string,
  notify?: (message: string) => void
): void {
  logError(error, context);
  
  if (notify) {
    const message = formatErrorMessage(error);
    notify(message);
  }
}

/**
 * Wraps an async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, context);
      throw error;
    }
  }) as T;
}

/**
 * Safely executes a function and returns a result or error
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    logError(error, context);
    
    return {
      success: false,
      error: createError(
        ErrorCodes.UNKNOWN_ERROR,
        formatErrorMessage(error),
        error
      ),
    };
  }
}

/**
 * Validates a condition and throws an error if it fails
 */
export function assert(
  condition: boolean,
  code: string,
  message: string
): asserts condition {
  if (!condition) {
    throw createError(code, message);
  }
}

/**
 * Retries a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
