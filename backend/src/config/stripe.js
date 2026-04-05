const Stripe = require('stripe');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey)
  : null;

module.exports = {
  stripe,
  stripeSecretKey,
};
