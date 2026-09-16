import { ApolloServer } from 'apollo-server-express';
import { typeDefs } from './schema';
import { createResolvers } from './resolvers';
import { OrderService } from '../services/orderService';
import { AuthService } from '../services/authService';
import { PromoService } from '../services/promoService';
import { PaymentService } from '../services/paymentService';

export const createApolloServer = (
  orderService: OrderService,
  authService: AuthService,
  promoService: PromoService,
  paymentService: PaymentService
) => {
  const resolvers = createResolvers(orderService, authService, promoService, paymentService);

  return new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => ({ req }),
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return {
        message: error.message,
        path: error.path,
        extensions: error.extensions
      };
    },
    introspection: true
  });
};
