import { OrderRecord, OrderDTO, ProductRecord, PromoEntity } from '../types/entities';
import { IOrderRepository, IProductRepository, IPromoRepository } from '../repositories/interfaces';
import { AppError } from '../types/errors';
import { OrderExpiryPolicy } from './orderExpiryPolicy';

export class OrderService {
  constructor(
    private orderRepository: IOrderRepository,
    private productRepository: IProductRepository,
    private promoRepository: IPromoRepository,
    private expiryPolicy: OrderExpiryPolicy,
    private checkoutTtlMs: number
  ) {}

  async getOrdersByUserId(userId: string): Promise<OrderDTO[]> {
    const orders = this.orderRepository.findByUserId(userId)
      .map(order => this.expiryPolicy.reconcile(order));
    return orders.map(order => this.transformToDTO(order));
  }

  async getOrderById(orderId: string, userId: string): Promise<OrderDTO | null> {
    const order = this.orderRepository.findById(orderId);

    if (!order) {
      return null;
    }

    if (order.userId !== userId) {
      return null;
    }

    const reconciled = this.expiryPolicy.reconcile(order);
    return this.transformToDTO(reconciled);
  }

  calculateOrderSum(products: Array<{id: string, amount: number, price: number}>, promoId?: string): number {
    const subtotal = products.reduce((total, product) => {
      return total + (product.amount * product.price);
    }, 0);

    if (!promoId) {
      return subtotal;
    }

    // Validate promo
    const promo = this.promoRepository.findById(promoId);
    if (!promo) {
      return subtotal; // Return original sum if promo not found
    }

    // Check if promo is expired
    const currentTime = Date.now();
    if (currentTime > promo.dueDate) {
      return subtotal; // Return original sum if promo expired
    }

    // Apply discount
    const discount = (subtotal * promo.discount) / 100;
    return subtotal - discount;
  }

  async deleteProductFromOrder(orderId: string, productId: string, userId: string): Promise<OrderDTO | null> {
    const order = this.orderRepository.findById(orderId);

    if (!order) {
      return null;
    }

    if (order.userId !== userId) {
      return null;
    }

    const reconciled = this.expiryPolicy.reconcile(order);

    // A submited order is locked for the duration of a payment attempt.
    if (reconciled.status !== 'created') {
      throw new AppError('ORDER_LOCKED', 'Order cannot be edited while a payment is in progress or has been paid');
    }

    // Remove the product from the order
    const updatedProducts = reconciled.products.filter(item => item.id !== productId);

    // If no products left, return null (order would be empty)
    if (updatedProducts.length === 0) {
      return null;
    }

    // Create updated order record
    const updatedOrder: OrderRecord = {
      ...reconciled,
      products: updatedProducts
    };

    // Update the in-memory repository
    this.updateOrder(updatedOrder);

    // Transform to DTO and return
    return this.transformToDTO(updatedOrder);
  }

  async updateProductAmount(orderId: string, productId: string, newAmount: number, userId: string): Promise<OrderDTO | null> {
    const order = this.orderRepository.findById(orderId);

    if (!order) {
      return null;
    }

    if (order.userId !== userId) {
      return null;
    }

    const reconciled = this.expiryPolicy.reconcile(order);

    if (reconciled.status !== 'created') {
      throw new AppError('ORDER_LOCKED', 'Order cannot be edited while a payment is in progress or has been paid');
    }

    // Update the product amount
    const updatedProducts = reconciled.products.map(item =>
      item.id === productId
        ? { ...item, amount: Math.max(1, Math.min(10, newAmount)) }
        : item
    );

    // Create updated order record
    const updatedOrder: OrderRecord = {
      ...reconciled,
      products: updatedProducts
    };

    // Update the in-memory repository
    this.updateOrder(updatedOrder);

    // Transform to DTO and return
    return this.transformToDTO(updatedOrder);
  }

  async submitOrder(orderId: string, userId: string): Promise<boolean> {
    const order = this.orderRepository.findById(orderId);

    if (!order) {
      return false;
    }

    if (order.userId !== userId) {
      return false;
    }

    const reconciled = this.expiryPolicy.reconcile(order);

    // Check if order is in 'created' status
    if (reconciled.status !== 'created') {
      return false;
    }

    const amount = this.calculateOrderSum(reconciled.products, reconciled.promo?.id);
    const now = Date.now();

    // A resumable window from a prior failed attempt is preserved, not
    // extended - only a genuinely fresh checkout gets a full new deadline.
    const updatedOrder: OrderRecord = {
      ...reconciled,
      status: 'submited',
      checkoutExpiresAt: reconciled.checkoutExpiresAt ?? (now + this.checkoutTtlMs),
      checkoutAmount: amount,
      checkoutPausedAt: undefined,
    };

    // Update the in-memory repository
    this.updateOrder(updatedOrder);
    return true;
  }

  private updateOrder(updatedOrder: OrderRecord): void {
    // Update the order in the in-memory repository
    // This method should be called whenever order state changes
    this.orderRepository.update(updatedOrder);
    console.log(`Order ${updatedOrder.orderId} updated in repository`);
  }

  private transformToDTO(order: OrderRecord): OrderDTO {
    const products = order.products.map(item => {
      const product = this.productRepository.findById(item.id);
      if (!product) {
        throw new Error(`Product with id ${item.id} not found`);
      }

      return {
        product,
        amount: Math.max(1, Math.min(10, item.amount)), // Ensure amount is between 1-10
        price: item.price
      };
    });

    // Remove duplicates and sum amounts for same products
    const uniqueProducts = new Map<string, { product: ProductRecord; amount: number; price: number }>();

    products.forEach(item => {
      const existing = uniqueProducts.get(item.product.id);
      if (existing) {
        existing.amount = Math.min(10, existing.amount + item.amount);
        // Keep the first price encountered for the product
        if (!existing.price) {
          existing.price = item.price;
        }
      } else {
        uniqueProducts.set(item.product.id, item);
      }
    });

    const expiresInMs = order.checkoutExpiresAt !== undefined
      ? this.expiryPolicy.remainingMs(order) ?? undefined
      : undefined;

    return {
      orderId: order.orderId,
      status: order.status,
      products: Array.from(uniqueProducts.values()),
      promo: order.promo,
      expiresAt: order.checkoutExpiresAt,
      expiresInMs,
      paymentPaused: order.checkoutPausedAt !== undefined,
    };
  }
}
