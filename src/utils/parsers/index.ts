import type { BrokerParser } from './BrokerParser';
import { AcornsParser } from './AcornsParser';
import { SchwabMonthlyParser } from './SchwabMonthlyParser';

export * from './BrokerParser';
export * from './AcornsParser';
export * from './SchwabMonthlyParser';

// Registry of all available broker parsers
export const BROKER_PARSERS: Record<string, BrokerParser> = {
  acorns: new AcornsParser(),
  'schwab-monthly': new SchwabMonthlyParser(),
  // Future parsers can be added here:
  // fidelity: new FidelityParser(),
  // robinhood: new RobinhoodParser(),
};

// Get list of available brokers for UI dropdown
export function getAvailableBrokers(): Array<{ id: string; name: string }> {
  return Object.values(BROKER_PARSERS).map(parser => ({
    id: parser.id,
    name: parser.name
  }));
}

// Get parser by ID
export function getParser(brokerId: string): BrokerParser | undefined {
  return BROKER_PARSERS[brokerId];
}
