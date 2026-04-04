const Stripe = require('stripe');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripePublishableKey = process.env.STRIPE_PUBLIC_KEY || process.env.VITE_STRIPE_PUBLIC_KEY || '';

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey)
  : null;

module.exports = {
  stripe,
  stripeSecretKey,
  stripePublishableKey,
};
