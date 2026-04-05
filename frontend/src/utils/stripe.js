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

        fail('A biblioteca segura da Stripe foi carregada, mas não ficou disponível no navegador.');
      };

      const handleError = (event) => {
        fail('Não foi possível carregar a biblioteca segura da Stripe. Verifique sua conexão, extensões do navegador ou filtros de rede.', event);
      };

      timeoutId = window.setTimeout(() => {
        fail('Os campos seguros da Stripe demoraram demais para carregar. Tente novamente ou verifique se o navegador está bloqueando recursos externos.');
      }, STRIPE_LOAD_TIMEOUT_MS);

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      if (!existingScript) {
        script.src = STRIPE_JS_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        const target = document.head || document.body;
        if (!target) {
          fail('Não foi possível preparar a página para carregar a Stripe.');
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
    throw new Error('A chave pública da Stripe não foi encontrada no ambiente.');
  }

  return key;
}

export async function getStripe() {
  if (!stripePromise) {
    stripePromise = Promise.all([loadStripeScript(), fetchPublishableKey()])
      .then(([StripeConstructor, publishableKey]) => {
        if (!StripeConstructor) {
          throw new Error('A Stripe não está disponível neste navegador.');
        }

        const stripe = StripeConstructor(publishableKey);
        if (!stripe) {
          throw new Error('Não foi possível inicializar a Stripe com a chave pública configurada.');
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
