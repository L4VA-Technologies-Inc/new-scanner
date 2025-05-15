import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { query } from '../../db';
import logger from '../../utils/logger';
import { apiKeyAuth, requirePermission } from '../../middleware/auth';
import { AuthenticatedRequest, EventType } from '../../types';

const router = Router();

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Register a new webhook
 *     description: Register a new webhook to receive notifications for blockchain events
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, url, event_types]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name for the webhook
 *               url:
 *                 type: string
 *                 description: URL to receive webhook notifications
 *               secret:
 *                 type: string
 *                 description: Optional secret for webhook payload verification
 *               event_types:
 *                 type: array
 *                 description: Types of events to subscribe to
 *                 items:
 *                   type: string
 *                   enum: [address_transaction, contract_execution, token_mint, token_burn]
 *               headers:
 *                 type: object
 *                 description: Optional custom headers to include in webhook requests
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [write]
 *     responses:
 *       201:
 *         description: Webhook created successfully
 *       400:
 *         description: Invalid webhook data
 *       500:
 *         description: Server error
 */
router.post('/', apiKeyAuth, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const { name, url, secret, event_types, headers } = req.body;

    if (!name || !url || !event_types || !Array.isArray(event_types) || event_types.length === 0) {
      return res.status(400).json({ error: 'Name, URL, and at least one event type are required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Validate event types
    const validEventTypes = Object.values(EventType);
    const invalidEventTypes = event_types.filter(type => !validEventTypes.includes(type as EventType));

    if (invalidEventTypes.length > 0) {
      return res.status(400).json({
        error: 'Invalid event types',
        invalid_types: invalidEventTypes,
        valid_types: validEventTypes
      });
    }

    // Create the webhook
    const result = await query(
      `INSERT INTO webhooks (name, url, secret, event_types, headers, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id, name, url, event_types, created_at`,
      [
        name,
        url,
        secret || null,
        JSON.stringify(event_types),
        headers ? JSON.stringify(headers) : null,
        (req as AuthenticatedRequest).apiKey?.id
      ]
    );

    logger.info(`Webhook registered: ${name} (${url})`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error registering webhook:', error);
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});

/**
 * @swagger
 * /api/webhooks:
 *   get:
 *     summary: List webhooks
 *     description: Get a list of all registered webhooks
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   name:
 *                     type: string
 *                   url:
 *                     type: string
 *                   event_types:
 *                     type: array
 *                     items:
 *                       type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: Server error
 */
router.get('/', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, name, url, event_types, created_at, is_active
       FROM webhooks
       ORDER BY created_at DESC`,
      []
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error listing webhooks:', error);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

/**
 * @swagger
 * /api/webhooks/{webhookId}:
 *   put:
 *     summary: Update webhook
 *     description: Update an existing webhook configuration
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         description: Webhook ID
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               secret:
 *                 type: string
 *               event_types:
 *                 type: array
 *                 items:
 *                   type: string
 *               headers:
 *                 type: object
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [write]
 *     responses:
 *       200:
 *         description: Webhook updated successfully
 *       400:
 *         description: Invalid webhook data
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Server error
 */
router.put('/:webhookId', apiKeyAuth, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const { name, url, secret, event_types, headers, is_active } = req.body;

    // Build update fields and values
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (url !== undefined) {
      updateFields.push(`url = $${paramIndex++}`);
      values.push(url);

      // Validate URL format
      try {
        new URL(url);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
    }

    if (secret !== undefined) {
      updateFields.push(`secret = $${paramIndex++}`);
      values.push(secret || null);
    }

    if (event_types !== undefined) {
      if (!Array.isArray(event_types) || event_types.length === 0) {
        return res.status(400).json({ error: 'At least one event type is required' });
      }

      // Validate event types
      const validEventTypes = Object.values(EventType);
      const invalidEventTypes = event_types.filter(type => !validEventTypes.includes(type as EventType));

      if (invalidEventTypes.length > 0) {
        return res.status(400).json({
          error: 'Invalid event types',
          invalid_types: invalidEventTypes,
          valid_types: validEventTypes
        });
      }

      updateFields.push(`event_types = $${paramIndex++}::text[]`);
      values.push(event_types);
    }

    if (headers !== undefined) {
      updateFields.push(`headers = $${paramIndex++}`);
      values.push(headers ? JSON.stringify(headers) : null);
    }

    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add webhook ID to values
    values.push(webhookId);

    // Update the webhook
    const result = await query(
      `UPDATE webhooks 
       SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex}
       RETURNING id, name, url, event_types, created_at, is_active`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    logger.info(`Webhook updated: ${webhookId}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`Error updating webhook ${req.params.webhookId}:`, error);
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

/**
 * @swagger
 * /api/webhooks/{webhookId}:
 *   delete:
 *     summary: Delete webhook
 *     description: Delete an existing webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         description: Webhook ID
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [write]
 *     responses:
 *       200:
 *         description: Webhook deleted successfully
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Server error
 */
router.delete('/:webhookId', apiKeyAuth, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;

    // Mark webhook as inactive (don't actually delete it)
    const result = await query(
      'UPDATE webhooks SET is_active = false WHERE id = $1 RETURNING id',
      [webhookId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    logger.info(`Webhook deleted: ${webhookId}`);
    res.status(204).end();
  } catch (error) {
    logger.error(`Error deleting webhook ${req.params.webhookId}:`, error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

/**
 * @swagger
 * /api/webhooks/{webhookId}/test:
 *   post:
 *     summary: Test webhook
 *     description: Send a test notification to the webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         description: Webhook ID
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [read]
 *     responses:
 *       200:
 *         description: Test notification sent successfully
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Failed to send test notification
 */
router.post('/:webhookId/test', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const { event_type = EventType.TRANSACTION_RECEIVED } = req.body;

    // Get webhook details
    const webhookResult = await query(
      'SELECT * FROM webhooks WHERE id = $1 AND is_active = true',
      [webhookId]
    );

    if (webhookResult.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found or not active' });
    }

    const webhook = webhookResult.rows[0];

    // Check if webhook supports the test event type
    const webhookEventTypes = webhook.event_types;
    if (!webhookEventTypes.includes(event_type)) {
      return res.status(400).json({
        error: `Webhook does not support event type: ${event_type}`,
        supported_types: webhookEventTypes
      });
    }

    // Create test payload
    const testPayload = {
      id: crypto.randomUUID(),
      type: event_type,
      timestamp: new Date().toISOString(),
      test: true,
      data: {
        message: 'This is a test webhook delivery',
        webhook_id: webhookId
      }
    };

    // Sign payload if webhook has a secret
    let signature = '';
    if (webhook.secret) {
      signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(JSON.stringify(testPayload))
        .digest('hex');
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Cardano-Scanner-Webhook/1.0',
      'X-Webhook-ID': webhookId,
      'X-Event-Type': event_type,
      'X-Delivery-ID': crypto.randomUUID(),
      'X-Delivery-Timestamp': new Date().toISOString(),
      'X-Test-Delivery': 'true'
    };

    if (signature) {
      headers['X-Webhook-Signature'] = signature;
    }

    // Add custom headers if defined
    if (webhook.headers) {
      Object.assign(headers, webhook.headers);
    }

    try {
      // Send the test webhook
      const response = await axios.post(webhook.url, testPayload, { headers, timeout: 10000 });

      // Return the test results
      res.json({
        success: true,
        status_code: response.status,
        response_data: response.data,
        request: {
          url: webhook.url,
          headers,
          payload: testPayload
        }
      });

      logger.info(`Test webhook delivery to ${webhook.url} succeeded with status ${response.status}`);
    } catch (error: unknown) {
      // Return error details
      const axiosError = error as AxiosError;
      res.status(400).json({
        success: false,
        error: axiosError.message,
        status_code: axiosError.response?.status,
        response_data: axiosError.response?.data,
        request: {
          url: webhook.url,
          headers,
          payload: testPayload
        }
      });

      logger.warn(`Test webhook delivery to ${webhook.url} failed: ${(error as Error).message}`);
    }
  } catch (error: unknown) {
    logger.error(`Error testing webhook ${req.params.webhookId}:`, error);
    res.status(500).json({ error: 'Failed to test webhook' });
  }
});

export default router;
