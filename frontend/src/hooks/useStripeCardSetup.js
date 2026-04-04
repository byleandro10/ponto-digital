import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { BILLING_REQUEST_TIMEOUT_MS, getStripe } from '../utils/stripe';

const CARD_ELEMENT_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: {
      fontSize: '16px',
      color: '#111827',
      fontFamily: 'system-ui, sans-serif',
      lineHeight: '24px',
      '::placeholder': {
        color: '#9ca3af',
      },
    },
    invalid: {
      color: '#dc2626',
      iconColor: '#dc2626',
    },
  },
};

export function useStripeCardSetup({ enabled, email }) {
  const containerRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const cardElementRef = useRef(null);

  const [stripeReady, setStripeReady] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeLoadError, setStripeLoadError] = useState('');
  const [cardError, setCardError] = useState('');
  const [cardComplete, setCardComplete] = useState(false);

  const unmount = useCallback(() => {
    setStripeReady(false);
    setStripeLoadError('');
    setCardError('');
    setCardComplete(false);

    if (cardElementRef.current) {
      cardElementRef.current.unmount();
      cardElementRef.current = null;
    }

    elementsRef.current = null;
  }, []);

  const mount = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    setStripeLoading(true);
    setStripeLoadError('');
    setCardError('');
    setCardComplete(false);
    setStripeReady(false);

    try {
      const stripe = await getStripe();
      stripeRef.current = stripe;

      if (cardElementRef.current) {
        cardElementRef.current.unmount();
        cardElementRef.current = null;
      }

      elementsRef.current = stripe.elements();
      const cardElement = elementsRef.current.create('card', CARD_ELEMENT_OPTIONS);
      cardElement.on('change', (event) => {
        const nextError = event.error?.message || '';
        const nextComplete = Boolean(event.complete);
        setCardError(nextError);
        setCardComplete(nextComplete);
        setStripeReady(nextComplete && !nextError);
      });
      cardElement.mount(containerRef.current);
      cardElementRef.current = cardElement;
    } catch (error) {
      setStripeLoadError(error.response?.data?.error || error.message || 'Nao foi possivel carregar o formulario seguro da Stripe.');
    } finally {
      setStripeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !containerRef.current) {
      return undefined;
    }

    let active = true;

    (async () => {
      if (!active) return;
      await mount();
    })();

    return () => {
      active = false;
      unmount();
    };
  }, [enabled, mount, unmount]);

  const confirmCardSetup = useCallback(async ({ cardHolder }) => {
    if (!stripeRef.current || !cardElementRef.current) {
      throw new Error('O formulario seguro da Stripe ainda nao esta pronto.');
    }

    const setupIntentRes = await api.post(
      '/billing/setup-intent',
      { email },
      { timeout: BILLING_REQUEST_TIMEOUT_MS }
    );

    const clientSecret = setupIntentRes.data?.clientSecret;
    if (!clientSecret) {
      throw new Error('Nao foi possivel iniciar a validacao do cartao com a Stripe.');
    }

    const { setupIntent, error } = await stripeRef.current.confirmCardSetup(clientSecret, {
      payment_method: {
        card: cardElementRef.current,
        billing_details: {
          name: cardHolder,
          email,
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Falha ao validar o cartao na Stripe.');
    }

    if (!setupIntent?.payment_method) {
      throw new Error('A Stripe nao retornou um metodo de pagamento valido.');
    }

    return {
      paymentMethodId: setupIntent.payment_method,
      setupIntentId: setupIntent.id || setupIntentRes.data?.setupIntentId || null,
    };
  }, [email]);

  return {
    containerRef,
    stripeReady,
    stripeLoading,
    stripeLoadError,
    cardError,
    cardComplete,
    mount,
    confirmCardSetup,
  };
}
