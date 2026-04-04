import { loadStripe } from '@stripe/stripe-js';
import api from '../services/api';

let stripePromise = null;
let publishableKeyPromise = null;

async function getPublishableKey() {
  if (!publishableKeyPromise) {
    publishableKeyPromise = api
      .get('/billing/public-config')
      .then((response) => response.data?.publishableKey || import.meta.env.VITE_STRIPE_PUBLIC_KEY || '')
      .catch(() => import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');
  }

  const key = await publishableKeyPromise;
  if (!key) {
    throw new Error('A Stripe não foi configurada corretamente. Defina STRIPE_PUBLIC_KEY no ambiente de produção.');
  }

  return key;
}

export async function getStripe() {
  if (!stripePromise) {
    stripePromise = getPublishableKey().then((key) => loadStripe(key));
  }

  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error('Não foi possível carregar a Stripe no navegador.');
  }

  return stripe;
}
