import { loadStripe } from '@stripe/stripe-js';
import api from '../services/api';

const BILLING_REQUEST_TIMEOUT_MS = 30000;

let stripePromise = null;

async function fetchPublishableKey() {
  const envKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
  if (envKey) {
    return envKey;
  }

  const response = await api.get('/billing/public-config', {
    timeout: BILLING_REQUEST_TIMEOUT_MS,
  });

  const key = response.data?.publishableKey;
  if (!key) {
    throw new Error('A chave pública da Stripe não foi encontrada.');
  }

  return key;
}

export async function getStripe() {
  if (!stripePromise) {
    stripePromise = fetchPublishableKey()
      .then((publishableKey) => loadStripe(publishableKey))
      .then((stripe) => {
        if (!stripe) {
          throw new Error('Não foi possível inicializar a Stripe.');
        }
        return stripe;
      })
      .catch((error) => {
        stripePromise = null;
        throw error;
      });
  }

  return stripePromise;
}

export { BILLING_REQUEST_TIMEOUT_MS };
