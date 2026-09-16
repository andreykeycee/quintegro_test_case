import express, { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { specs } from './config/swagger';
import { delayMiddleware } from './middleware/delayMiddleware';
import { errorTestMiddleware } from './middleware/errorTestMiddleware';
import { createApolloServer } from './graphql/server';
import { createAuthRoutes } from './routes/authRoutes';
import { createOrderRoutes } from './routes/orderRoutes';
import { createPromoRoutes } from './routes/promoRoutes';
import { createResetRoutes } from './routes/resetRoutes';
import { createPaymentRoutes } from './routes/paymentRoutes';
import { AuthController } from './controllers/authController';
import { OrderController } from './controllers/orderController';
import { PromoController } from './controllers/promoController';
import { PaymentWebhookController } from './controllers/paymentWebhookController';
import { createContainer, AppContainer } from './container';

// The mock webhook and PayPal-approval endpoints aren't user-facing: random
// chaos-test delays/500s there just make manual testing ambiguous. Every
// other route (including createPaymentIntent) stays under the chaos
// middleware on purpose - that's what idempotency keys are for.
const PAYMENT_INTERNAL_PREFIXES = ['/api/payments/webhook', '/api/payments/mock'];

const skipFor = (prefixes: string[], middleware: RequestHandler): RequestHandler =>
  (req, res, next) => (prefixes.some(p => req.path.startsWith(p)) ? next() : middleware(req, res, next));

export class App {
  public app: express.Application;
  private container: AppContainer;

  constructor() {
    this.app = express();
    this.container = createContainer();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeSwagger();
    this.initializeGraphQL();
  }

  private initializeMiddlewares(): void {
    this.app.use(helmet({ contentSecurityPolicy: (process.env.NODE_ENV === 'production') ? undefined : false }));
    this.app.use(cors());
    this.app.use(express.json({
      // Captures the exact bytes for HMAC verification, without reordering middleware.
      verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); }
    }));
    this.app.use(express.urlencoded({ extended: true }));

    // Add delay to all API requests
    this.app.use(skipFor(PAYMENT_INTERNAL_PREFIXES, delayMiddleware(1500)));

    // Add error test middleware (returns 500 on every 5th request)
    this.app.use(skipFor(PAYMENT_INTERNAL_PREFIXES, errorTestMiddleware));

    // Serve static files for product images
    this.app.use('/productImg', express.static('public/productImg'));
  }

  private initializeRoutes(): void {
    const { authService, orderService, promoService, paymentService, providerRegistry, mockPayPalProvider } = this.container;

    // Initialize controllers
    const authController = new AuthController(authService);
    const orderController = new OrderController(orderService, authService);
    const promoController = new PromoController(promoService);
    const paymentWebhookController = new PaymentWebhookController(paymentService, providerRegistry, mockPayPalProvider);

    // Setup routes
    this.app.use('/api', createAuthRoutes(authController));
    this.app.use('/api/order', createOrderRoutes(orderController));
    this.app.use('/api/promo', createPromoRoutes(promoController));
    this.app.use('/api/payments', createPaymentRoutes(paymentWebhookController));
    this.app.use('/reset/orders', createResetRoutes(this.container.resettables));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Quintegro API',
        version: '1.0.0',
        endpoints: {
          docs: '/api-docs',
          health: '/health',
          login: '/api/login',
          orders: '/api/order',
          promos: '/api/promo',
          payments: '/api/payments'
        }
      });
    });
  }

  private initializeSwagger(): void {
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  }

  private async initializeGraphQL(): Promise<void> {
    const { orderService, authService, promoService, paymentService } = this.container;

    // Create Apollo Server
    const apolloServer = createApolloServer(orderService, authService, promoService, paymentService);
    await apolloServer.start();

    // Apply Apollo Server middleware
    // Cast: apollo-server-express bundles its own (older) @types/express,
    // which conflicts structurally with the app's own - pre-existing
    // dependency mismatch, not a real type error.
    apolloServer.applyMiddleware({
      app: this.app as any,
      path: '/graphql',
      cors: false // We're already using CORS middleware
    });

    console.log(`🚀 GraphQL server ready at http://localhost:3000${apolloServer.graphqlPath}`);
  }

  public listen(port: number): void {
    this.app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
      console.log(`📚 API Documentation available at http://localhost:${port}/api-docs`);
      console.log(`🔐 Login endpoint: http://localhost:${port}/api/login`);
      console.log(`🔮 GraphQL Playground available at http://localhost:${port}/graphql`);
    });
  }
}
