export interface UserRecord {
  id: string;
  name: string;
}

export interface AuthRecord {
  userId: string;
  login: string;
  password: string;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export interface ProductRecord {
  id: string;
  title: string;
  description: string;
  image: string;
}

export interface OrderRecord {
  orderId: string;
  userId: string;
  status: 'created' | 'submited' | 'finished';
  createAt: number;
  products: Array<{
    id: string;
    amount: number;
    price: number;
  }>;
  promo?: PromoEntity;
  checkoutExpiresAt?: number;  // epoch ms deadline for the current/last checkout window
  checkoutAmount?: number;     // price lock snapshotted at submit, copied onto every intent
  checkoutPausedAt?: number;   // set while a payment is in flight; freezes the countdown
}

export interface OrderDTO {
  orderId: string;
  status: 'created' | 'submited' | 'finished';
  products: Array<{
    product: ProductRecord;
    amount: number;
    price: number;
  }>;
  promo?: PromoEntity;
  expiresAt?: number;
  expiresInMs?: number;
  paymentPaused?: boolean;
}

export interface PromoEntity {
  id: string;
  discount: number;
  dueDate: number;
}
