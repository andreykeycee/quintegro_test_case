import { gql } from '@apollo/client';

// Mutation for user login
export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
    }
  }
`;

// Mutation to submit an order
export const SUBMIT_ORDER = gql`
  mutation SubmitOrder($orderId: ID!) {
    submitOrder(orderId: $orderId)
  }
`;

// Mutation to delete a product from an order
export const DELETE_PRODUCT_FROM_ORDER = gql`
  mutation DeleteProductFromOrder($orderId: ID!, $productId: ID!) {
    deleteProductFromOrder(orderId: $orderId, productId: $productId) {
      orderId
      status
      products {
        product {
          id
          title
          description
          image
        }
        amount
        price
      }
      promo {
        id
        discount
        dueDate
      }
    }
  }
`;

// Mutation to start a payment attempt for an order in checkout
export const CREATE_PAYMENT_INTENT = gql`
  mutation CreatePaymentIntent($input: CreatePaymentIntentInput!) {
    createPaymentIntent(input: $input) {
      id
      orderId
      provider
      status
      amount
      failureCode
      failureMessage
      details {
        ... on CardDetails {
          last4
          brand
        }
        ... on PayPalDetails {
          payerEmail
          approvalUrl
        }
      }
    }
  }
`;

// Mutation to complete the PayPal leg after the customer returns from approval
export const CONFIRM_PAYMENT_INTENT = gql`
  mutation ConfirmPaymentIntent($orderId: ID!, $intentId: ID!) {
    confirmPaymentIntent(orderId: $orderId, intentId: $intentId) {
      id
      status
      failureCode
      failureMessage
    }
  }
`;

// Mutation to cancel an in-flight payment attempt (e.g. the user backs out of PayPal)
export const CANCEL_PAYMENT_INTENT = gql`
  mutation CancelPaymentIntent($orderId: ID!, $intentId: ID!) {
    cancelPaymentIntent(orderId: $orderId, intentId: $intentId) {
      id
      status
    }
  }
`;
