import { ApolloError } from 'apollo-server-express';
import { OrderService } from '../services/orderService';
import { AuthService } from '../services/authService';
import { PromoService } from '../services/promoService';
import { PaymentService } from '../services/paymentService';
import { PaymentIntentRecord, PaymentProviderId } from '../types/payment';
import { PaymentCredentials } from '../payments/providerAdapter';
import { AppError } from '../types/errors';

const toPaymentIntentGQL = (intent: PaymentIntentRecord) => ({
  ...intent,
  details: intent.methodDetails,
});

export const createResolvers = (
  orderService: OrderService,
  authService: AuthService,
  promoService: PromoService,
  paymentService: PaymentService
) => {
  const extractUserIdFromToken = (context: any): string | null => {
    const authHeader = context.req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);

    if (!decoded || !decoded.userId) {
      return null;
    }

    return decoded.userId;
  };

  const credentialsFromInput = (input: any): PaymentCredentials => {
    if (input.provider === 'local_bank') {
      if (!input.card) throw new ApolloError('Card details are required for local_bank payments', 'INVALID_INPUT');
      return {
        method: 'local_bank',
        cardNumber: input.card.number,
        cvv: input.card.cvv,
        holderName: input.card.name,
        expMonth: input.card.expMonth,
        expYear: input.card.expYear,
      };
    }
    if (!input.paypal) throw new ApolloError('PayPal details are required for paypal payments', 'INVALID_INPUT');
    return { method: 'paypal', payerEmail: input.paypal.payerEmail };
  };

  return {
    PaymentMethodDetails: {
      __resolveType: (obj: any) => (obj.method === 'paypal' ? 'PayPalDetails' : 'CardDetails'),
    },

    Order: {
      paymentIntent: (parent: any) => {
        const intent = paymentService.getLatestIntent(parent.orderId);
        return intent ? toPaymentIntentGQL(intent) : null;
      },
      paymentIntents: (parent: any) => paymentService.listIntents(parent.orderId).map(toPaymentIntentGQL),
    },

    Query: {
      orders: async (parent: any, args: any, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) {
          throw new Error('Authentication required');
        }

        try {
          return await orderService.getOrdersByUserId(userId);
        } catch (error) {
          throw new Error('Failed to fetch orders');
        }
      },

      order: async (parent: any, { orderId }: { orderId: string }, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) {
          throw new Error('Authentication required');
        }

        try {
          const order = await orderService.getOrderById(orderId, userId);
          if (!order) {
            throw new Error('Order not found or access denied');
          }
          return order;
        } catch (error) {
          throw new Error('Failed to fetch order');
        }
      },

      orderSum: async (parent: any, { orderId, products, promo }: { orderId: string, products: any[], promo?: string }, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) {
          throw new Error('Authentication required');
        }

        try {
          return orderService.calculateOrderSum(products, promo);
        } catch (error) {
          throw new Error('Failed to calculate order sum');
        }
      },

      promo: async (parent: any, { promoId }: { promoId: string }, context: any) => {
        try {
          const validation = promoService.validatePromo(promoId);

          if (!validation.isValid) {
            if (validation.error === 'Promo not found') {
              throw new Error('Promo not found');
            } else if (validation.error === 'Promo expired') {
              throw new Error('Promo expired');
            }
          }

          return validation.promo;
        } catch (error) {
          throw new Error('Failed to fetch promo');
        }
      }
    },

    Mutation: {
      login: async (parent: any, { input }: { input: { login: string, password: string } }, context: any) => {
        try {
          const token = await authService.authenticateUser(input.login, input.password);

          if (!token) {
            throw new Error('Invalid credentials');
          }

          return { token };
        } catch (error) {
          throw new Error('Login failed');
        }
      },

      submitOrder: async (parent: any, { orderId }: { orderId: string }, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) {
          throw new Error('Authentication required');
        }

        try {
          const success = await orderService.submitOrder(orderId, userId);
          if (!success) {
            throw new Error('Order not found or access denied');
          }
          return success;
        } catch (error) {
          throw new Error('Failed to submit order');
        }
      },

      deleteProductFromOrder: async (parent: any, { orderId, productId }: { orderId: string, productId: string }, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) {
          throw new Error('Authentication required');
        }

        try {
          const updatedOrder = await orderService.deleteProductFromOrder(orderId, productId, userId);
          if (!updatedOrder) {
            throw new ApolloError('Order not found or access denied', 'ORDER_NOT_FOUND');
          }
          return updatedOrder;
        } catch (error) {
          if (error instanceof ApolloError) throw error;
          if (error instanceof AppError) throw new ApolloError(error.message, error.code);
          throw new ApolloError('Failed to delete product from order', 'INTERNAL_ERROR');
        }
      },

      createPaymentIntent: async (parent: any, { input }: { input: any }, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) throw new ApolloError('Authentication required', 'AUTHENTICATION_REQUIRED');

        try {
          const credentials = credentialsFromInput(input);
          const intent = await paymentService.createIntent(
            input.orderId,
            userId,
            input.provider as PaymentProviderId,
            credentials,
            input.idempotencyKey
          );
          return toPaymentIntentGQL(intent);
        } catch (error) {
          if (error instanceof ApolloError) throw error;
          if (error instanceof AppError) throw new ApolloError(error.message, error.code);
          throw new ApolloError('Failed to create payment intent', 'INTERNAL_ERROR');
        }
      },

      confirmPaymentIntent: async (parent: any, { orderId, intentId }: { orderId: string, intentId: string }, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) throw new ApolloError('Authentication required', 'AUTHENTICATION_REQUIRED');

        try {
          const intent = await paymentService.confirmIntent(orderId, userId, intentId);
          return toPaymentIntentGQL(intent);
        } catch (error) {
          if (error instanceof AppError) throw new ApolloError(error.message, error.code);
          throw new ApolloError('Failed to confirm payment intent', 'INTERNAL_ERROR');
        }
      },

      cancelPaymentIntent: async (parent: any, { orderId, intentId }: { orderId: string, intentId: string }, context: any) => {
        const userId = extractUserIdFromToken(context);
        if (!userId) throw new ApolloError('Authentication required', 'AUTHENTICATION_REQUIRED');

        try {
          const intent = await paymentService.cancelIntent(orderId, userId, intentId);
          return toPaymentIntentGQL(intent);
        } catch (error) {
          if (error instanceof AppError) throw new ApolloError(error.message, error.code);
          throw new ApolloError('Failed to cancel payment intent', 'INTERNAL_ERROR');
        }
      }
    }
  };
};
