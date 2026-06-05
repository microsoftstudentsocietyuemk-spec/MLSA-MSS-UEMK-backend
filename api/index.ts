// Vercel Serverless Function Handler
// This file exports the Express app from server.ts for Vercel deployment
import app from '../server.js';

// Export handler for Vercel's serverless environment
export default app;
