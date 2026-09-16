import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  type Product {
    id: ID!
    title: String!
    description: String!
    image: String!
  }

  type OrderItem {
    product: Product!
    amount: Int!
    price: Float!
  }

  type Promo {
    id: ID!
    discount: Int!
    dueDate: Float!
  }

  enum PaymentProvider {
    local_bank
    paypal
  }

  enum PaymentIntentStatus {
    processing
    requires_action
    succeeded
    failed
    canceled
    expired
  }

  type CardDetails {
    last4: String!
    brand: String!
    expMonth: Int!
    expYear: Int!
    holderName: String!
  }

  type PayPalDetails {
    payerEmail: String!
    payerId: String
    approvalUrl: String
  }

  union PaymentMethodDetails = CardDetails | PayPalDetails

  type PaymentIntent {
    id: ID!
    orderId: ID!
    provider: PaymentProvider!
    status: PaymentIntentStatus!
    amount: Float!
    details: PaymentMethodDetails!
    failureCode: String
    failureMessage: String
    createdAt: Float!
    updatedAt: Float!
  }

  type Order {
    orderId: ID!
    status: OrderStatus!
    products: [OrderItem!]!
    promo: Promo
    expiresAt: Float
    expiresInMs: Int
    paymentPaused: Boolean!
    paymentIntent: PaymentIntent
    paymentIntents: [PaymentIntent!]!
  }

  enum OrderStatus {
    created
    submited
    finished
  }

  input ProductInput {
    id: ID!
    amount: Int!
    price: Float!
  }

  input LoginInput {
    login: String!
    password: String!
  }

  type LoginResponse {
    token: String!
  }

  input CardInput {
    name: String!
    number: String!
    cvv: String!
    expMonth: Int!
    expYear: Int!
  }

  input PayPalInput {
    payerEmail: String!
  }

  input CreatePaymentIntentInput {
    orderId: ID!
    provider: PaymentProvider!
    idempotencyKey: String!
    card: CardInput
    paypal: PayPalInput
  }

  type Query {
    orders: [Order!]!
    order(orderId: ID!): Order
    orderSum(orderId: ID!, products: [ProductInput!]!, promo: String): Float!
    promo(promoId: ID!): Promo
  }

  type Mutation {
    login(input: LoginInput!): LoginResponse!
    submitOrder(orderId: ID!): Boolean!
    deleteProductFromOrder(orderId: ID!, productId: ID!): Order
    createPaymentIntent(input: CreatePaymentIntentInput!): PaymentIntent!
    confirmPaymentIntent(orderId: ID!, intentId: ID!): PaymentIntent!
    cancelPaymentIntent(orderId: ID!, intentId: ID!): PaymentIntent!
  }
`;
