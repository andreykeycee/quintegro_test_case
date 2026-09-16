import { UserRecord, AuthRecord, OrderRecord, ProductRecord, PromoEntity } from '../types/entities';
import { PaymentIntentRecord, IdempotencyRecord, ExternalRef, PaymentProviderId } from '../types/payment';

export interface Resettable {
  reset(): void;
}

export interface IUserRepository {
  findById(id: string): UserRecord | undefined;
  findAll(): UserRecord[];
}

export interface IAuthRepository {
  findByLogin(login: string): AuthRecord | undefined;
  findByLoginAndPassword(login: string, password: string): AuthRecord | undefined;
  findAll(): AuthRecord[];
}

export interface IOrderRepository {
  findById(orderId: string): OrderRecord | undefined;
  findByUserId(userId: string): OrderRecord[];
  findAll(): OrderRecord[];
  update(order: OrderRecord): void;
}

export interface IProductRepository {
  findById(id: string): ProductRecord | undefined;
  findAll(): ProductRecord[];
}

export interface IPromoRepository {
  findById(id: string): PromoEntity | undefined;
  findAll(): PromoEntity[];
}

export interface IPaymentIntentRepository {
  findById(id: string): PaymentIntentRecord | undefined;
  findByOrderId(orderId: string): PaymentIntentRecord[];
  findByExternalRef(ref: ExternalRef): PaymentIntentRecord | undefined;
  create(intent: PaymentIntentRecord): void;
  update(intent: PaymentIntentRecord): void;
}

export interface IWebhookEventRepository {
  wasProcessed(provider: PaymentProviderId, eventId: string): boolean;
  markProcessed(provider: PaymentProviderId, eventId: string): void;
}

export interface IIdempotencyRepository {
  find(scopedKey: string): IdempotencyRecord | undefined;
  reserve(record: IdempotencyRecord): 'reserved' | 'exists';
  complete(scopedKey: string, intentId: string): void;
  release(scopedKey: string): void;
}
