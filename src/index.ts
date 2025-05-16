import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import logger from './utils/logger';
import apiRoutes from './api/routes';
import healthRoutes from './api/routes/health';
import { initializeDatabase } from './db/init';
import blockchainMonitor from './blockchain/monitor';
import webhookProcessor from './webhooks/processor';
import { setupSwagger } from './api/swagger';
import { runMigrations } from './db/migrate';
import { initializeWebSocket } from './websocket/server';
import http from 'http';

// Create Express app
const app = express();

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS support
app.use(express.json()); // JSON body parser

// Set up Swagger documentation
setupSwagger(app);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Check the health status of the service
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-10-26T12:00:00.000Z
 *       500:
 *         description: Service is unhealthy or an error occurred
 */
// Health check endpoint - moved to src/api/routes/health.ts
// app.get('/health', (req, res) => {
//   res.json({ status: 'ok', timestamp: new Date().toISOString() });
// });

// Mount health routes
app.use('/health', healthRoutes);

// Mount API routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

// Initialize the application
const startApp = async () => {
  try {
    // Run database migrations
    await runMigrations();
    logger.info('Database migrations applied successfully');

    // Initialize the database
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Start the blockchain monitoring service
    await blockchainMonitor.initializeMonitoring();
    logger.info('Blockchain monitoring service started');

    // Start the webhook processor
    webhookProcessor.startWebhookProcessor();
    logger.info('Webhook processor started');

    // Start the server
    const port = config.server.port;
    // Create HTTP server from Express app
    const server = http.createServer(app);

    // Initialize WebSocket server
    initializeWebSocket(server);

    server.listen(port, () => {
      logger.info(`Cardano Blockchain Scanner service is running on port ${port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`API Documentation: http://localhost:${port}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
};

// Start the application
startApp().catch(error => {
  logger.error('Startup error:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  // Close server, database connections, etc.
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  // Close server, database connections, etc.
  process.exit(0);
});
