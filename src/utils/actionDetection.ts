/**
 * Improved option action detection for statement parsers
 * Fixes Priority 2.1: Incorrect option action detection edge cases
 */

export type OptionAction = 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close';

export interface ActionDetectionContext {
  category: 'Sale' | 'Purchase';
  action?: string;
  hasRealizedGL?: boolean;
  description?: string;
  quantity?: number;
}

/**
 * Determine the correct option action based on transaction context
 * 
 * Logic:
 * - Sale + Short Sale = sell-to-open (opening a short position)
 * - Purchase + Cover Short = buy-to-close (closing a short position)
 * - Purchase + realized G/L = buy-to-close (closing a long position)
 * - Sale + realized G/L = sell-to-close (closing a long position)
 * - Purchase (no G/L) = buy-to-open (opening a long position)
 * - Sale (no G/L, no Short Sale) = sell-to-close (likely closing, but ambiguous)
 */
export function determineOptionAction(context: ActionDetectionContext): {
  action: OptionAction;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
} {
  const { category, action, hasRealizedGL, description } = context;
  
  // High confidence cases
  if (category === 'Sale' && action === 'Short Sale') {
    return {
      action: 'sell-to-open',
      confidence: 'high',
      reasoning: 'Sale with "Short Sale" action indicates opening a short position'
    };
  }
  
  if (category === 'Purchase' && action === 'Cover Short') {
    return {
      action: 'buy-to-close',
      confidence: 'high',
      reasoning: 'Purchase with "Cover Short" action indicates closing a short position'
    };
  }
  
  // Medium confidence cases with realized G/L
  if (category === 'Purchase' && hasRealizedGL) {
    return {
      action: 'buy-to-close',
      confidence: 'medium',
      reasoning: 'Purchase with realized G/L indicates closing a short position'
    };
  }
  
  if (category === 'Sale' && hasRealizedGL) {
    return {
      action: 'sell-to-close',
      confidence: 'medium',
      reasoning: 'Sale with realized G/L indicates closing a long position'
    };
  }
  
  // Check description for hints
  if (description) {
    const descLower = description.toLowerCase();
    if (descLower.includes('opening') || descLower.includes('open')) {
      if (category === 'Purchase') {
        return {
          action: 'buy-to-open',
          confidence: 'medium',
          reasoning: 'Purchase with "opening" in description'
        };
      } else {
        return {
          action: 'sell-to-open',
          confidence: 'medium',
          reasoning: 'Sale with "opening" in description'
        };
      }
    }
    
    if (descLower.includes('closing') || descLower.includes('close')) {
      if (category === 'Purchase') {
        return {
          action: 'buy-to-close',
          confidence: 'medium',
          reasoning: 'Purchase with "closing" in description'
        };
      } else {
        return {
          action: 'sell-to-close',
          confidence: 'medium',
          reasoning: 'Sale with "closing" in description'
        };
      }
    }
  }
  
  // Low confidence defaults
  if (category === 'Purchase') {
    return {
      action: 'buy-to-open',
      confidence: 'low',
      reasoning: 'Purchase without clear indicators, defaulting to buy-to-open'
    };
  } else {
    // Sale without clear indicators - this is ambiguous
    // Could be sell-to-open or sell-to-close
    // Default to sell-to-close as it's more common for retail traders
    return {
      action: 'sell-to-close',
      confidence: 'low',
      reasoning: 'Sale without clear indicators, defaulting to sell-to-close (ambiguous)'
    };
  }
}

/**
 * Validate action consistency with quantity and position
 * Returns warnings if the detected action seems inconsistent
 */
export function validateActionConsistency(
  detectedAction: OptionAction,
  context: ActionDetectionContext
): string[] {
  const warnings: string[] = [];
  
  // Check for unusual patterns
  if (detectedAction === 'sell-to-open' && context.hasRealizedGL) {
    warnings.push('Detected sell-to-open with realized G/L, which is unusual. Verify this is correct.');
  }
  
  if (detectedAction === 'buy-to-open' && context.hasRealizedGL) {
    warnings.push('Detected buy-to-open with realized G/L, which is unusual. Verify this is correct.');
  }
  
  if (context.category === 'Sale' && detectedAction.startsWith('buy-')) {
    warnings.push('Category is "Sale" but action is buy-*. This may indicate a parsing error.');
  }
  
  if (context.category === 'Purchase' && detectedAction.startsWith('sell-')) {
    warnings.push('Category is "Purchase" but action is sell-*. This may indicate a parsing error.');
  }
  
  return warnings;
}
