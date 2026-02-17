import type { BrokerParser } from './BrokerParser';
import { AcornsParser } from './AcornsParser';
import { SchwabMonthlyParser } from './SchwabMonthlyParser';
import { FidelityParser } from './FidelityParser';

export * from './BrokerParser';
export * from './AcornsParser';
export * from './SchwabMonthlyParser';
export * from './FidelityParser';

// Registry of all available broker parsers
export const BROKER_PARSERS: Record<string, BrokerParser> = {
  acorns: new AcornsParser(),
  'schwab-monthly': new SchwabMonthlyParser(),
  fidelity: new FidelityParser(),
  // Future parsers can be added here:
  // robinhood: new RobinhoodParser(),
  // vanguard: new VanguardParser(),
  // ibkr: new IBKRParser(),
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
