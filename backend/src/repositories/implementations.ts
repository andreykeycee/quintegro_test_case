import { UserRecord, AuthRecord, OrderRecord, ProductRecord, PromoEntity } from '../types/entities';
import { PaymentIntentRecord, IdempotencyRecord, ExternalRef, PaymentProviderId, externalRefKey } from '../types/payment';
import {
  IUserRepository,
  IAuthRepository,
  IOrderRepository,
  IProductRepository,
  IPromoRepository,
  IPaymentIntentRepository,
  IWebhookEventRepository,
  IIdempotencyRepository,
  Resettable,
} from './interfaces';

export class InMemoryUserRepository implements IUserRepository {
  private users: UserRecord[] = [
    {
      id: "user-1",
      name: "John Doe"
    },
    {
      id: "user-2", 
      name: "Jane Smith"
    }
  ];

  findById(id: string): UserRecord | undefined {
    return this.users.find(user => user.id === id);
  }

  findAll(): UserRecord[] {
    return [...this.users];
  }
}

export class InMemoryAuthRepository implements IAuthRepository {
  private authRecords: AuthRecord[] = [
    {
      userId: "user-1",
      login: "john.doe",
      password: "password123"
    },
    {
      userId: "user-2",
      login: "jane.smith", 
      password: "password456"
    }
  ];

  findByLogin(login: string): AuthRecord | undefined {
    return this.authRecords.find(auth => auth.login === login);
  }

  findByLoginAndPassword(login: string, password: string): AuthRecord | undefined {
    return this.authRecords.find(auth => 
      auth.login === login && auth.password === password
    );
  }

  findAll(): AuthRecord[] {
    return [...this.authRecords];
  }
}

export class InMemoryProductRepository implements IProductRepository {
  private products: ProductRecord[] = [
    {
      id: "product-1",
      title: "Laptop",
      description: "High-performance laptop with latest specifications and great battery life. Perfect for work and gaming.",
      image: "/productImg/laptop.svg"
    },
    {
      id: "product-2",
      title: "Smartphone",
      description: "Modern smartphone with advanced camera system and long-lasting battery. Features the latest mobile technology.",
      image: "/productImg/smartphone.svg"
    },
    {
      id: "product-3",
      title: "Headphones",
      description: "Wireless noise-canceling headphones with premium sound quality and comfortable design for extended use.",
      image: "/productImg/headphones.svg"
    },
    {
      id: "product-4",
      title: "Tablet",
      description: "Lightweight tablet perfect for entertainment and productivity. Features a high-resolution display and fast processor.",
      image: "/productImg/tablet.svg"
    }
  ];

  findById(id: string): ProductRecord | undefined {
    return this.products.find(product => product.id === id);
  }

  findAll(): ProductRecord[] {
    return [...this.products];
  }
}

export class InMemoryOrderRepository implements IOrderRepository, Resettable {
  private orders: OrderRecord[] = [
    {
      orderId: "order-1",
      userId: "user-1",
      status: "finished",
      createAt: Date.now() - 86400000, // 1 day ago
      products: [
        { id: "product-1", amount: 1, price: 1299.99 },
        { id: "product-3", amount: 2, price: 199.99 }
      ]
    },
    {
      orderId: "order-2",
      userId: "user-1",
      status: "created",
      createAt: Date.now(),
      products: [
        { id: "product-2", amount: 1, price: 899.99 },
        { id: "product-4", amount: 1, price: 599.99 }
      ]
    }
  ];

  reset(): void {
    this.orders = [
      {
        orderId: "order-1",
        userId: "user-1",
        status: "finished",
        createAt: Date.now() - 86400000,
        products: [
          { id: "product-1", amount: 1, price: 1299.99 },
          { id: "product-3", amount: 2, price: 199.99 }
        ]
      },
      {
        orderId: "order-2",
        userId: "user-1",
        status: "created",
        createAt: Date.now(),
        products: [
          { id: "product-2", amount: 1, price: 899.99 },
          { id: "product-4", amount: 1, price: 599.99 }
        ]
      }
    ];
  }

  findById(orderId: string): OrderRecord | undefined {
    return this.orders.find(order => order.orderId === orderId);
  }

  findByUserId(userId: string): OrderRecord[] {
    return this.orders.filter(order => order.userId === userId);
  }

  findAll(): OrderRecord[] {
    return [...this.orders];
  }

  update(order: OrderRecord): void {
    const index = this.orders.findIndex(o => o.orderId === order.orderId);
    if (index !== -1) {
      this.orders[index] = order;
    }
  }
}

export class InMemoryPromoRepository implements IPromoRepository {
  private promos: PromoEntity[] = [
    {
      id: "SAVE10",
      discount: 10,
      dueDate: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    {
      id: "SAVE20",
      discount: 20,
      dueDate: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days from now
    },
    {
      id: "SAVE5",
      discount: 5,
      dueDate: Date.now() - (24 * 60 * 60 * 1000) // 1 day ago (expired)
    }
  ];

  findById(id: string): PromoEntity | undefined {
    return this.promos.find(promo => promo.id === id);
  }

  findAll(): PromoEntity[] {
    return [...this.promos];
  }
}

export class InMemoryPaymentIntentRepository implements IPaymentIntentRepository, Resettable {
  private intents: PaymentIntentRecord[] = [];
  // Reverse lookup is the fallback path (metadata-carried intentId is primary),
  // but a provider's webhook must still be resolvable by its own id alone.
  private byExternalRef = new Map<string, string>();

  reset(): void {
    this.intents = [];
    this.byExternalRef.clear();
  }

  findById(id: string): PaymentIntentRecord | undefined {
    return this.intents.find(intent => intent.id === id);
  }

  findByOrderId(orderId: string): PaymentIntentRecord[] {
    return this.intents.filter(intent => intent.orderId === orderId);
  }

  findByExternalRef(ref: ExternalRef): PaymentIntentRecord | undefined {
    const id = this.byExternalRef.get(externalRefKey(ref));
    return id ? this.findById(id) : undefined;
  }

  create(intent: PaymentIntentRecord): void {
    this.intents.push(intent);
    if (intent.externalRef) {
      this.byExternalRef.set(externalRefKey(intent.externalRef), intent.id);
    }
  }

  update(intent: PaymentIntentRecord): void {
    const index = this.intents.findIndex(i => i.id === intent.id);
    if (index !== -1) {
      this.intents[index] = intent;
    }
    if (intent.externalRef) {
      this.byExternalRef.set(externalRefKey(intent.externalRef), intent.id);
    }
  }
}

export class InMemoryWebhookEventRepository implements IWebhookEventRepository, Resettable {
  private processed = new Set<string>();

  reset(): void {
    this.processed.clear();
  }

  wasProcessed(provider: PaymentProviderId, eventId: string): boolean {
    return this.processed.has(`${provider}:${eventId}`);
  }

  markProcessed(provider: PaymentProviderId, eventId: string): void {
    this.processed.add(`${provider}:${eventId}`);
  }
}

export class InMemoryIdempotencyRepository implements IIdempotencyRepository, Resettable {
  private records = new Map<string, IdempotencyRecord>();

  reset(): void {
    this.records.clear();
  }

  find(scopedKey: string): IdempotencyRecord | undefined {
    return this.records.get(scopedKey);
  }

  reserve(record: IdempotencyRecord): 'reserved' | 'exists' {
    if (this.records.has(record.scopedKey)) return 'exists';
    this.records.set(record.scopedKey, record);
    return 'reserved';
  }

  complete(scopedKey: string, intentId: string): void {
    const record = this.records.get(scopedKey);
    if (record) this.records.set(scopedKey, { ...record, intentId });
  }

  release(scopedKey: string): void {
    this.records.delete(scopedKey);
  }
}
