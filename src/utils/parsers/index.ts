import type { BrokerParser } from './BrokerParser';
import { AcornsParser } from './AcornsParser';

export * from './BrokerParser';
export * from './AcornsParser';

// Registry of all available broker parsers
export const BROKER_PARSERS: Record<string, BrokerParser> = {
  acorns: new AcornsParser(),
  // Future parsers can be added here:
  // schwab: new SchwabParser(),
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
