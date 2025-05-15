import { Router, Request, Response } from 'express';
import { query } from '../../db';
import logger from '../../utils/logger';
import { apiKeyAuth, requirePermission } from '../../middleware/auth';
import { AuthenticatedRequest } from '../../types';
import blockfrostService from '../../blockchain/blockfrost';

const router = Router();

/**
 * @swagger
 * /api/monitoring/addresses:
 *   post:
 *     summary: Add address to monitor
 *     description: Add a Cardano wallet address to the monitoring system
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 type: string
 *                 description: Cardano wallet address to monitor
 *               name:
 *                 type: string
 *                 description: Optional friendly name for this address
 *               description:
 *                 type: string
 *                 description: Optional description for reference
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [write]
 *     responses:
 *       201:
 *         description: Address added to monitoring successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 address:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid address or missing required fields
 *       409:
 *         description: Address is already being monitored
 *       500:
 *         description: Server error
 */
router.post('/addresses', apiKeyAuth, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const { address, name, description } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Validate the address by checking if it exists on the blockchain
    try {
      await blockfrostService.getAddressInfo(address);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid Cardano address' });
    }

    // Check if address is already being monitored
    const existingResult = await query(
      'SELECT id FROM monitored_addresses WHERE address = $1',
      [address]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'Address is already being monitored', id: existingResult.rows[0].id });
    }

    // Add the address to monitoring
    const result = await query(
      `INSERT INTO monitored_addresses (address, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, address, name, description, created_at`,
      [
        address,
        name || null,
        description || null,
        (req as AuthenticatedRequest).apiKey?.id
      ]
    );

    logger.info(`Address added to monitoring: ${address}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error adding address to monitoring:', error);
    res.status(500).json({ error: 'Failed to add address to monitoring' });
  }
});

/**
 * @swagger
 * /api/monitoring/addresses:
 *   get:
 *     summary: List monitored addresses
 *     description: Get a list of all Cardano addresses being monitored
 *     tags: [Monitoring]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of monitored addresses
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
 *                   address:
 *                     type: string
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   last_checked_at:
 *                     type: string
 *                     format: date-time
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   is_active:
 *                     type: boolean
 *       500:
 *         description: Server error
 */
router.get('/addresses', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, address, name, description, last_checked_at, created_at, is_active
       FROM monitored_addresses
       ORDER BY created_at DESC`,
      []
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error listing monitored addresses:', error);
    res.status(500).json({ error: 'Failed to list monitored addresses' });
  }
});

/**
 * @swagger
 * /api/monitoring/addresses/{addressId}:
 *   get:
 *     summary: Get monitoring address by id
 *     description: Select address by id
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         description: ID of the monitored address
 *         schema:
 *           type: string
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       204:
 *         description: Address selected from monitoring successfully
 *       404:
 *         description: Monitored address not found
 *       500:
 *         description: Server error
 */
router.get('/addresses/:addressId', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { addressId } = req.params;

    // Mark address as inactive (don't actually delete it)
    const result = await query(
        'SELECT * FROM monitored_addresses WHERE address = $1;',
        [addressId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Monitored address not found' });
    }

    logger.info(`Address found : ${addressId}`);
    res.status(204).end();
  } catch (error) {
    logger.error(`Error selecting ${req.params.addressId} from monitoring:`, error);
    res.status(500).json({ error: 'Failed to select address from monitoring' });
  }
});

/**
 * @swagger
 * /api/monitoring/addresses/{addressId}:
 *   delete:
 *     summary: Remove address from monitoring
 *     description: Stop monitoring a Cardano address
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         description: ID of the monitored address
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [write]
 *     responses:
 *       204:
 *         description: Address removed from monitoring successfully
 *       404:
 *         description: Monitored address not found
 *       500:
 *         description: Server error
 */
router.delete('/addresses/:addressId', apiKeyAuth, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const { addressId } = req.params;

    // Mark address as inactive (don't actually delete it)
    const result = await query(
      'UPDATE monitored_addresses SET is_active = false WHERE id = $1 RETURNING id',
      [addressId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Monitored address not found' });
    }

    logger.info(`Address removed from monitoring: ${addressId}`);
    res.status(204).end();
  } catch (error) {
    logger.error(`Error removing address ${req.params.addressId} from monitoring:`, error);
    res.status(500).json({ error: 'Failed to remove address from monitoring' });
  }
});

/**
 * @swagger
 * /api/monitoring/contracts:
 *   post:
 *     summary: Add contract to monitor
 *     description: Add a Cardano smart contract to the monitoring system
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 type: string
 *                 description: Cardano contract address to monitor
 *               name:
 *                 type: string
 *                 description: Optional friendly name for this contract
 *               description:
 *                 type: string
 *                 description: Optional description for reference
 *               contract_type:
 *                 type: string
 *                 description: Optional type of contract (e.g., defi, nft, marketplace)
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [write]
 *     responses:
 *       201:
 *         description: Contract added to monitoring successfully
 *       400:
 *         description: Invalid contract address or missing required fields
 *       409:
 *         description: Contract is already being monitored
 *       500:
 *         description: Server error
 */
router.post('/contracts', apiKeyAuth, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const { address, name, description, contract_type } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Contract address is required' });
    }

    // Validate the address by checking if it exists on the blockchain
    try {
      await blockfrostService.getAddressInfo(address);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid Cardano address' });
    }

    // Check if contract is already being monitored
    const existingResult = await query(
      'SELECT id FROM monitored_contracts WHERE address = $1',
      [address]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'Contract is already being monitored', id: existingResult.rows[0].id });
    }

    // Add the contract to monitoring
    const result = await query(
      `INSERT INTO monitored_contracts (address, name, description, contract_type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, address, name, description, contract_type, created_at`,
      [
        address,
        name || null,
        description || null,
        contract_type || null,
        (req as AuthenticatedRequest).apiKey?.id
      ]
    );

    logger.info(`Contract added to monitoring: ${address}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error adding contract to monitoring:', error);
    res.status(500).json({ error: 'Failed to add contract to monitoring' });
  }
});

/**
 * @swagger
 * /api/monitoring/contracts:
 *   get:
 *     summary: List monitored contracts
 *     description: Get a list of all Cardano smart contracts being monitored
 *     tags: [Monitoring]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of monitored contracts
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
 *                   address:
 *                     type: string
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   contract_type:
 *                     type: string
 *                   last_checked_at:
 *                     type: string
 *                     format: date-time
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   is_active:
 *                     type: boolean
 *       500:
 *         description: Server error
 */
router.get('/contracts', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, address, name, description, contract_type, last_checked_at, created_at, is_active
       FROM monitored_contracts
       ORDER BY created_at DESC`,
      []
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error listing monitored contracts:', error);
    res.status(500).json({ error: 'Failed to list monitored contracts' });
  }
});

/**
 * @swagger
 * /api/monitoring/contracts/{contractId}:
 *   delete:
 *     summary: Remove contract from monitoring
 *     description: Stop monitoring a Cardano smart contract
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         description: ID of the monitored contract
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - ApiKeyAuth: []
 *       - PermissionAuth: [write]
 *     responses:
 *       204:
 *         description: Contract removed from monitoring successfully
 *       404:
 *         description: Monitored contract not found
 *       500:
 *         description: Server error
 */
router.delete('/contracts/:contractId', apiKeyAuth, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    // Mark contract as inactive (don't actually delete it)
    const result = await query(
      'UPDATE monitored_contracts SET is_active = false WHERE id = $1 RETURNING id',
      [contractId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Monitored contract not found' });
    }

    logger.info(`Contract removed from monitoring: ${contractId}`);
    res.status(204).end();
  } catch (error) {
    logger.error(`Error removing contract ${req.params.contractId} from monitoring:`, error);
    res.status(500).json({ error: 'Failed to remove contract from monitoring' });
  }
});

export default router;
