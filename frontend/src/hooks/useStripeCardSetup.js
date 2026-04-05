import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { BILLING_REQUEST_TIMEOUT_MS, STRIPE_LOAD_TIMEOUT_MS, getStripe } from '../utils/stripe';

const CARD_STYLE = {
  base: {
    color: '#111827',
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: '16px',
    fontSmoothing: 'antialiased',
    '::placeholder': {
      color: '#9ca3af',
    },
  },
  invalid: {
    color: '#dc2626',
  },
};

function getFriendlyStripeError(error) {
  if (!error) {
    return 'Não foi possível validar o cartão.';
  }

  if (error.type === 'validation_error' || error.type === 'card_error') {
    return error.message || 'Revise os dados do cartão e tente novamente.';
  }

  return error.message || 'Não foi possível validar o cartão.';
}

export function useStripeCardSetup({ enabled, email }) {
  const cardElementRef = useRef(null);
  const stripeRef = useRef(null);
  const stripeElementsRef = useRef(null);
  const mountedElementRef = useRef(null);
  const mountTimeoutRef = useRef(null);
  const readyRef = useRef(false);

  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeLoadError, setStripeLoadError] = useState('');
  const [cardError, setCardError] = useState('');
  const [cardComplete, setCardComplete] = useState(false);

  const clearMountTimeout = useCallback(() => {
    if (mountTimeoutRef.current) {
      window.clearTimeout(mountTimeoutRef.current);
      mountTimeoutRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearMountTimeout();

    try {
      mountedElementRef.current?.unmount();
      mountedElementRef.current?.destroy();
    } catch {
      // noop
    }

    mountedElementRef.current = null;
    stripeElementsRef.current = null;
    readyRef.current = false;
    setStripeReady(false);
    setCardComplete(false);
    setCardError('');
  }, [clearMountTimeout]);

  const mount = useCallback(async () => {
    if (!enabled || !cardElementRef.current) {
      return;
    }

    teardown();
    setStripeLoading(true);
    setStripeLoadError('');

    try {
      const stripe = await getStripe();
      stripeRef.current = stripe;

      const elements = stripe.elements({
        locale: 'pt-BR',
      });

      stripeElementsRef.current = elements;

      const cardElement = elements.create('card', {
        style: CARD_STYLE,
        hidePostalCode: true,
      });

      cardElement.on('change', (event) => {
        setCardComplete(Boolean(event.complete));
        setCardError(event.error?.message || '');
      });

      cardElement.on('ready', () => {
        readyRef.current = true;
        clearMountTimeout();
        setStripeReady(true);
      });

      cardElement.mount(cardElementRef.current);
      mountedElementRef.current = cardElement;

      mountTimeoutRef.current = window.setTimeout(() => {
        if (!readyRef.current) {
          setStripeLoadError('Não foi possível carregar o campo do cartão. Atualize a página e tente novamente.');
          setStripeReady(false);
        }
      }, STRIPE_LOAD_TIMEOUT_MS);
    } catch (error) {
      setStripeLoadError(error.message || 'Não foi possível carregar o campo do cartão.');
      setStripeReady(false);
    } finally {
      setStripeLoading(false);
    }
  }, [clearMountTimeout, enabled, teardown]);

  useEffect(() => {
    if (!enabled) {
      teardown();
      return undefined;
    }

    mount();

    return () => {
      teardown();
    };
  }, [enabled, mount, teardown]);

  const confirmCardSetup = useCallback(async ({ cardHolder }) => {
    if (!stripeRef.current || !mountedElementRef.current || !readyRef.current) {
      throw new Error('O campo do cartão ainda não está pronto.');
    }

    const response = await api.post(
      '/billing/setup-intent',
      { email: email || undefined },
      { timeout: BILLING_REQUEST_TIMEOUT_MS }
    );

    const clientSecret = response.data?.clientSecret;
    const setupIntentId = response.data?.setupIntentId;

    if (!clientSecret) {
      throw new Error('Não foi possível iniciar a validação do cartão.');
    }

    const result = await stripeRef.current.confirmCardSetup(clientSecret, {
      payment_method: {
        card: mountedElementRef.current,
        billing_details: {
          name: cardHolder || undefined,
          email: email || undefined,
        },
      },
    });

    if (result.error) {
      throw new Error(getFriendlyStripeError(result.error));
    }

    if (!result.setupIntent?.payment_method) {
      throw new Error('Não foi possível concluir a validação do cartão.');
    }

    return {
      paymentMethodId: String(result.setupIntent.payment_method),
      setupIntentId: result.setupIntent.id || setupIntentId || null,
    };
  }, [email]);

  return {
    cardElementRef,
    stripeReady,
    stripeLoading,
    stripeLoadError,
    cardError,
    cardComplete,
    mount,
    confirmCardSetup,
  };
}
