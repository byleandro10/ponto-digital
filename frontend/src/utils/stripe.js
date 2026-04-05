import api from '../services/api';

const STRIPE_JS_URL = 'https://js.stripe.com/v3';
const BILLING_REQUEST_TIMEOUT_MS = 30000;
const STRIPE_LOAD_TIMEOUT_MS = 12000;

let stripePromise = null;
let stripeScriptPromise = null;

function getExistingStripeScript() {
  return document.querySelector(`script[src^="${STRIPE_JS_URL}"]`);
}

function loadStripeScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.Stripe) {
    return Promise.resolve(window.Stripe);
  }

  if (!stripeScriptPromise) {
    stripeScriptPromise = new Promise((resolve, reject) => {
      const existingScript = getExistingStripeScript();
      const script = existingScript || document.createElement('script');
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        script.removeEventListener('load', handleLoad);
        script.removeEventListener('error', handleError);
      };

      const fail = (message, cause) => {
        cleanup();
        stripeScriptPromise = null;
        reject(new Error(message, { cause }));
      };

      const handleLoad = () => {
        if (window.Stripe) {
          cleanup();
          resolve(window.Stripe);
          return;
        }

        fail('Não foi possível preparar o campo de pagamento.');
      };

      const handleError = (event) => {
        fail('Não foi possível carregar o campo de pagamento.', event);
      };

      timeoutId = window.setTimeout(() => {
        fail('O campo de pagamento não carregou. Atualize a página e tente novamente.');
      }, STRIPE_LOAD_TIMEOUT_MS);

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      if (!existingScript) {
        script.src = STRIPE_JS_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        const target = document.head || document.body;
        if (!target) {
          fail('Não foi possível preparar a página de pagamento.');
          return;
        }
        target.appendChild(script);
      }
    }).catch((error) => {
      stripeScriptPromise = null;
      throw error;
    });
  }

  return stripeScriptPromise;
}

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
    throw new Error('A configuração de pagamento está incompleta.');
  }

  return key;
}

export async function getStripe() {
  if (!stripePromise) {
    stripePromise = Promise.all([loadStripeScript(), fetchPublishableKey()])
      .then(([StripeConstructor, publishableKey]) => {
        if (!StripeConstructor) {
          throw new Error('O pagamento não está disponível neste navegador.');
        }

        const stripe = StripeConstructor(publishableKey);
        if (!stripe) {
          throw new Error('Não foi possível iniciar o pagamento agora.');
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

export { BILLING_REQUEST_TIMEOUT_MS, STRIPE_LOAD_TIMEOUT_MS };
