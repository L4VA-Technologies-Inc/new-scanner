# Cardano Blockchain Monitoring Service

A daemon service that monitors specified wallets and smart contracts on the Cardano blockchain, triggers webhook notifications for configured events, and provides an API for interacting with the Cardano blockchain.

## Features

- **Real-time Monitoring**: Track transactions, balance changes, and UTxO states for Cardano addresses and smart contracts
- **Webhook Notifications**: Receive notifications when monitored events occur
- **Comprehensive API**: Interact with the Cardano blockchain through a RESTful API
- **Flexible Event Filtering**: Configure which events trigger notifications
- **API Key Authentication**: Secure access with API keys and granular permissions. =)

## Technology Stack

- **Backend**: Node.js with TypeScript
- **Database**: PostgreSQL for data persistence
- **Blockchain Interface**: [Blockfrost API](https://blockfrost.io/)
- **API Framework**: Express.js
- **Authentication**: JWT-based authentication with API keys
- **Testing**: Jest for unit and integration tests
- **Deployment**: Docker and Docker Compose

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v14 or higher)
- Blockfrost API Key (for mainnet, preprod, or preview networks)

## Installation

### Local Development

1. Clone the repository:
   ```
   git clone <repository-url>
   cd cardano-scanner
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up your environment variables by copying the example file:
   ```
   cp .env.example .env
   ```
   Edit the `.env` file to include your Blockfrost API key and other configuration options.

4. Create the PostgreSQL database:
   ```
   createdb cardano_scanner
   ```

5. Run the application in development mode:
   ```
   npm run dev
   ```

### Docker Deployment

1. Clone the repository:
   ```
   git clone <repository-url>
   cd cardano-scanner
   ```

2. Create a `.env` file with your configuration:
   ```
   cp .env.example .env
   ```
   Update the file with your Blockfrost API key and other settings.

3. Build and start the containers:
   ```
   docker-compose up -d
   ```

## API Documentation

Once the server is running, the API documentation is available at:
- Swagger UI: `http://localhost:3000/api-docs`

### Authentication

All API endpoints require authentication using an API key provided in the `Authorization` header:

```
Authorization: Bearer your-api-key
```

### Key API Endpoints

#### Address and Contract Monitoring

- `POST /api/monitoring/addresses` - Add address to monitor
- `GET /api/monitoring/addresses` - List monitored addresses
- `DELETE /api/monitoring/addresses/:addressId` - Remove address from monitoring
- `POST /api/monitoring/contracts` - Add contract to monitor
- `GET /api/monitoring/contracts` - List monitored contracts
- `DELETE /api/monitoring/contracts/:contractId` - Remove contract from monitoring

#### Webhook Management

- `POST /api/webhooks` - Register new webhook
- `PUT /api/webhooks/:webhookId` - Update webhook configuration
- `DELETE /api/webhooks/:webhookId` - Delete webhook
- `GET /api/webhooks` - List registered webhooks
- `POST /api/webhooks/:webhookId/test` - Test webhook delivery

#### Blockchain Operations

- `GET /api/blockchain/addresses/:address/balance` - Get address balance
- `GET /api/blockchain/addresses/:address/transactions` - Get address transactions
- `GET /api/blockchain/addresses/:address/utxos` - Get address UTXOs
- `POST /api/blockchain/transactions` - Submit transaction
- `GET /api/blockchain/transactions/:txHash` - Get transaction details
- `GET /api/blockchain/contracts/:contractAddress/state` - Get contract state
- `GET /api/blockchain/tokens/:policyId/:assetName` - Get token information

## Event Types

The service monitors and generates events for the following types of blockchain activities:

- Transaction received/sent
- ADA received/sent
- Token received/sent/minted/burned
- NFT received/sent
- Contract execution
- Staking and delegation
- Governance activities
- DeFi protocol interactions
- Metadata transactions
- DEX activities
- Collateralized assets
- Multi-signature transactions
- Time-locked contracts
- Oracle data feeds

## License

[Specify license here]
