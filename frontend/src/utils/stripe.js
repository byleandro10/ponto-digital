import { loadStripe } from '@stripe/stripe-js';

let stripePromise = null;

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');
  }
  return stripePromise;
}
