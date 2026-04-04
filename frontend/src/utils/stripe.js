import { loadStripe } from '@stripe/stripe-js';
import api from '../services/api';

const BILLING_REQUEST_TIMEOUT_MS = 30000;

let stripePromise = null;
let publishableKeyPromise = null;

async function getPublishableKey() {
  const envKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';
  if (envKey) {
    return envKey;
  }

  if (!publishableKeyPromise) {
    publishableKeyPromise = api
      .get('/billing/public-config', { timeout: BILLING_REQUEST_TIMEOUT_MS })
      .then((response) => response.data?.publishableKey || '')
      .catch((error) => {
        if (error.code === 'ECONNABORTED') {
          throw new Error('A configuracao da Stripe demorou demais para responder.');
        }
        throw error;
      });
  }

  const key = await publishableKeyPromise;
  if (!key) {
    throw new Error('A Stripe nao foi configurada corretamente. Defina STRIPE_PUBLIC_KEY no ambiente.');
  }

  return key;
}

export async function getStripe() {
  if (!stripePromise) {
    stripePromise = getPublishableKey().then((key) => loadStripe(key));
  }

  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error('Nao foi possivel carregar a Stripe no navegador.');
  }

  return stripe;
}

export { BILLING_REQUEST_TIMEOUT_MS };
