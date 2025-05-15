import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import logger from '../utils/logger';
import { AuthenticatedRequest } from '../types';

/**
 * API Key authentication middleware
 * Validates the API key provided in the Authorization header
 */
export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Get API key from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'API key is required' });
      return;
    }

    const apiKey = authHeader.split(' ')[1];

    if (!apiKey) {
      res.status(401).json({ error: 'Invalid API key format' });
      return;
    }

    // In a real implementation, we would hash the API key and compare with the stored hash
    // For now, we'll just query based on a placeholder
    const keyHash = 'placeholder-hash-' + apiKey;

    // Check if API key exists and is active
    const result = await query(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true',
      [keyHash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const apiKeyData = result.rows[0];

    // Check if API key has expired
    if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
      res.status(401).json({ error: 'API key has expired' });
      return;
    }

    // Update last used timestamp
    await query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [apiKeyData.id]
    );

    // Attach API key data to request for use in route handlers
    (req as AuthenticatedRequest).apiKey = apiKeyData;

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Permission check middleware
 * Verifies that the authenticated API key has the required permission
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authenticatedReq = req as AuthenticatedRequest;

    if (!authenticatedReq.apiKey) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasPermission = authenticatedReq.apiKey.permissions.includes(permission) ||
                          authenticatedReq.apiKey.permissions.includes('admin');

    if (!hasPermission) {
      res.status(403).json({ error: `Permission denied: ${permission} is required` });
      return;
    }

    next();
  };
};
