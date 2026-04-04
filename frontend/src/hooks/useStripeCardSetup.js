import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { BILLING_REQUEST_TIMEOUT_MS, getStripe } from '../utils/stripe';

const BASE_STYLE = {
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

function mapElementName(elementType) {
  if (elementType === 'cardNumber') return 'Número do cartão';
  if (elementType === 'cardExpiry') return 'Validade';
  if (elementType === 'cardCvc') return 'Código de segurança';
  return 'Cartão';
}

export function useStripeCardSetup({ enabled, email }) {
  const cardNumberRef = useRef(null);
  const cardExpiryRef = useRef(null);
  const cardCvcRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const mountedRef = useRef(false);
  const stripeElementsRef = useRef({
    cardNumber: null,
    cardExpiry: null,
    cardCvc: null,
  });

  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeLoadError, setStripeLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
  });
  const [fieldComplete, setFieldComplete] = useState({
    cardNumber: false,
    cardExpiry: false,
    cardCvc: false,
  });

  const teardown = useCallback(() => {
    Object.values(stripeElementsRef.current).forEach((element) => {
      try {
        element?.unmount();
        element?.destroy();
      } catch {
        // noop
      }
    });

    stripeElementsRef.current = {
      cardNumber: null,
      cardExpiry: null,
      cardCvc: null,
    };
    elementsRef.current = null;
    mountedRef.current = false;
    setStripeReady(false);
  }, []);

  const mount = useCallback(async () => {
    if (!enabled) {
      return;
    }

    teardown();
    setStripeLoading(true);
    setStripeLoadError('');
    setFieldErrors({
      cardNumber: '',
      cardExpiry: '',
      cardCvc: '',
    });
    setFieldComplete({
      cardNumber: false,
      cardExpiry: false,
      cardCvc: false,
    });

    try {
      const stripe = await getStripe();
      stripeRef.current = stripe;

      const elements = stripe.elements();
      elementsRef.current = elements;

      const cardNumber = elements.create('cardNumber', { style: BASE_STYLE });
      const cardExpiry = elements.create('cardExpiry', { style: BASE_STYLE });
      const cardCvc = elements.create('cardCvc', { style: BASE_STYLE });

      const bindEvents = (element, elementType) => {
        element.on('change', (event) => {
          setFieldComplete((previous) => ({
            ...previous,
            [elementType]: Boolean(event.complete),
          }));

          setFieldErrors((previous) => ({
            ...previous,
            [elementType]: event.error?.message || '',
          }));
        });

        element.on('ready', () => {
          setStripeReady(true);
        });
      };

      bindEvents(cardNumber, 'cardNumber');
      bindEvents(cardExpiry, 'cardExpiry');
      bindEvents(cardCvc, 'cardCvc');

      cardNumber.mount(cardNumberRef.current);
      cardExpiry.mount(cardExpiryRef.current);
      cardCvc.mount(cardCvcRef.current);

      stripeElementsRef.current = {
        cardNumber,
        cardExpiry,
        cardCvc,
      };
      mountedRef.current = true;
    } catch (error) {
      setStripeLoadError(error.message || 'Não foi possível carregar o formulário seguro de cartão.');
      setStripeReady(false);
    } finally {
      setStripeLoading(false);
    }
  }, [enabled, teardown]);

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
    if (!stripeRef.current || !mountedRef.current || !stripeElementsRef.current.cardNumber) {
      throw new Error('O formulário do cartão ainda não está pronto.');
    }

    const response = await api.post(
      '/billing/setup-intent',
      { email: email || undefined },
      { timeout: BILLING_REQUEST_TIMEOUT_MS }
    );

    const clientSecret = response.data?.clientSecret;
    const setupIntentId = response.data?.setupIntentId;

    if (!clientSecret) {
      throw new Error('A Stripe não retornou os dados necessários para validar o cartão.');
    }

    const result = await stripeRef.current.confirmCardSetup(clientSecret, {
      payment_method: {
        card: stripeElementsRef.current.cardNumber,
        billing_details: {
          name: cardHolder || undefined,
          email: email || undefined,
        },
      },
    });

    if (result.error) {
      const fieldLabel = mapElementName(result.error.param);
      throw new Error(result.error.message || `Não foi possível validar ${fieldLabel.toLowerCase()}.`);
    }

    if (!result.setupIntent?.payment_method) {
      throw new Error('O método de pagamento não foi retornado pela Stripe.');
    }

    return {
      paymentMethodId: String(result.setupIntent.payment_method),
      setupIntentId: result.setupIntent.id || setupIntentId || null,
    };
  }, [email]);

  const cardComplete = fieldComplete.cardNumber && fieldComplete.cardExpiry && fieldComplete.cardCvc;
  const firstFieldError = fieldErrors.cardNumber || fieldErrors.cardExpiry || fieldErrors.cardCvc || '';

  return {
    cardNumberRef,
    cardExpiryRef,
    cardCvcRef,
    stripeReady,
    stripeLoading,
    stripeLoadError,
    fieldErrors,
    cardError: firstFieldError,
    cardComplete,
    mount,
    confirmCardSetup,
  };
}
