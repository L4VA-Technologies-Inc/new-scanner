import dotenv from 'dotenv';
import path from 'path';
import { CardanoNetwork } from '../types';

// Load environment variables from .env file
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
  database: {
    url: process.env.DATABASE_URL || 'postgres://nest_user:nest_password@localhost:5432/cardano_scanner',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default_jwt_secret_for_development_only',
    expiresIn: process.env.JWT_EXPIRATION || '24h',
  },
  blockfrost: {
    apiKey: process.env.BLOCKFROST_API_KEY || '',
    network: (process.env.BLOCKFROST_NETWORK || 'mainnet') as CardanoNetwork,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIRECTORY || path.join(process.cwd(), 'logs'),
  },
  webhook: {
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '5', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '30000', 10),
  },
  blockchain: {
    pollingInterval: parseInt(process.env.BLOCKCHAIN_POLLING_INTERVAL || '30000', 10),
  },
};

export default config;
