/**
 * Vercel Serverless Function - Entry point
 * Wraps the Express app as a single catch-all serverless function
 */
const app = require('../backend/src/app');

module.exports = app;
