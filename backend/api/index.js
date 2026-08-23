// Vercel serverless entry — wraps the Express app
// Vercel will route all requests here via vercel.json rewrites.
import app from '../src/server.js';

export default app;
