import {
  InMemoryUserRepository,
  InMemoryAuthRepository,
  InMemoryOrderRepository,
  InMemoryProductRepository,
  InMemoryPromoRepository,
  InMemoryPaymentIntentRepository,
  InMemoryWebhookEventRepository,
  InMemoryIdempotencyRepository,
} from './repositories/implementations';
import { Resettable } from './repositories/interfaces';
import { AuthService } from './services/authService';
import { OrderService } from './services/orderService';
import { PromoService } from './services/promoService';
import { PaymentService } from './services/paymentService';
import { OrderExpiryPolicy } from './services/orderExpiryPolicy';
import { PaymentProviderRegistry } from './payments/registry';
import { MockWebhookDispatcher } from './payments/mock/mockWebhookDispatcher';
import { MockBankProvider } from './payments/mock/mockBankProvider';
import { MockPayPalProvider } from './payments/mock/mockPayPalProvider';
import { loadPaymentsConfig, PaymentsConfig } from './config/payments';

export interface AppContainer {
  userRepository: InMemoryUserRepository;
  authRepository: InMemoryAuthRepository;
  orderRepository: InMemoryOrderRepository;
  productRepository: InMemoryProductRepository;
  promoRepository: InMemoryPromoRepository;
  paymentIntentRepository: InMemoryPaymentIntentRepository;
  webhookEventRepository: InMemoryWebhookEventRepository;
  idempotencyRepository: InMemoryIdempotencyRepository;

  authService: AuthService;
  orderService: OrderService;
  promoService: PromoService;
  paymentService: PaymentService;

  providerRegistry: PaymentProviderRegistry;
  mockWebhookDispatcher: MockWebhookDispatcher;
  mockPayPalProvider: MockPayPalProvider;

  resettables: Resettable[];
}

// Single composition root. REST and GraphQL used to each build their own
// repositories/services (see app.ts history) - since the payment webhook
// arrives over REST and the frontend reads over GraphQL, that split made
// payments impossible. Both now source from this one container.
export function createContainer(cfg: PaymentsConfig = loadPaymentsConfig()): AppContainer {
  const userRepository = new InMemoryUserRepository();
  const authRepository = new InMemoryAuthRepository();
  const orderRepository = new InMemoryOrderRepository();
  const productRepository = new InMemoryProductRepository();
  const promoRepository = new InMemoryPromoRepository();
  const paymentIntentRepository = new InMemoryPaymentIntentRepository();
  const webhookEventRepository = new InMemoryWebhookEventRepository();
  const idempotencyRepository = new InMemoryIdempotencyRepository();

  const mockWebhookDispatcher = new MockWebhookDispatcher(cfg);
  const mockBankProvider = new MockBankProvider(cfg, mockWebhookDispatcher);
  const mockPayPalProvider = new MockPayPalProvider(cfg, mockWebhookDispatcher);
  const providerRegistry = new PaymentProviderRegistry([mockBankProvider, mockPayPalProvider]);

  const authService = new AuthService(authRepository, userRepository);
  const promoService = new PromoService(promoRepository);
  const expiryPolicy = new OrderExpiryPolicy(orderRepository, paymentIntentRepository, providerRegistry, cfg);
  const orderService = new OrderService(orderRepository, productRepository, promoRepository, expiryPolicy, cfg.checkoutTtlMs);
  const paymentService = new PaymentService(
    orderRepository,
    paymentIntentRepository,
    webhookEventRepository,
    idempotencyRepository,
    providerRegistry,
    expiryPolicy,
    cfg,
  );

  return {
    userRepository,
    authRepository,
    orderRepository,
    productRepository,
    promoRepository,
    paymentIntentRepository,
    webhookEventRepository,
    idempotencyRepository,
    authService,
    orderService,
    promoService,
    paymentService,
    providerRegistry,
    mockWebhookDispatcher,
    mockPayPalProvider,
    resettables: [orderRepository, paymentIntentRepository, webhookEventRepository, idempotencyRepository, mockWebhookDispatcher],
  };
}
