import { PaymentProviderId } from '../types/payment';
import { PaymentProviderAdapter } from './providerAdapter';
import { AppError } from '../types/errors';

export class PaymentProviderRegistry {
  private readonly byId = new Map<PaymentProviderId, PaymentProviderAdapter>();

  constructor(adapters: PaymentProviderAdapter[]) {
    adapters.forEach(adapter => this.byId.set(adapter.id, adapter));
  }

  get(id: PaymentProviderId): PaymentProviderAdapter {
    const adapter = this.byId.get(id);
    if (!adapter) {
      throw new AppError('UNKNOWN_PROVIDER', `Unknown payment provider: ${id}`);
    }
    return adapter;
  }

  list(): PaymentProviderAdapter[] {
    return [...this.byId.values()];
  }
}
