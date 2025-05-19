#!/bin/bash

# Cardano Blockchain Scanner Startup Script
# =================================
# This script helps set up and run the Cardano Scanner application locally.
# It will check dependencies, create necessary files, and start the service.

echo "===== Cardano Blockchain Scanner Setup ====="
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check for Node.js
if ! command_exists node; then
  echo "❌ Node.js is not installed. Please install Node.js v16 or higher."
  exit 1
fi

# Check node version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 16 ]; then
  echo "❌ Node.js version is too old. Please upgrade to Node.js v16 or higher."
  exit 1
fi

echo "✅ Node.js version $(node -v) detected"

# Check for npm
if ! command_exists npm; then
  echo "❌ npm is not installed. Please install npm."
  exit 1
fi

echo "✅ npm version $(npm -v) detected"

# Check for PostgreSQL client (for database operations)
if command_exists psql; then
  echo "✅ PostgreSQL client detected"
else
  echo "⚠️  PostgreSQL client not found. Database migration might fail if database is not reachable."
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
  if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies. Check the error messages above."
    exit 1
  fi
  echo "✅ Dependencies installed successfully"
else
  echo "✅ Dependencies already installed"
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
  echo "Creating .env file with default values..."
  cat > .env << EOL
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://nest_user:nest_password@localhost:5432/cardano_scanner
JWT_SECRET=default_jwt_secret_for_development_only
BLOCKFROST_API_KEY=your_blockfrost_api_key_here
BLOCKFROST_NETWORK=preprod
LOG_LEVEL=debug
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_DELAY=30000
EOL
  echo "✅ .env file created. Please update the BLOCKFROST_API_KEY value in .env before proceeding."
  echo "⚠️  NOTE: Using default values for all settings. Edit .env for your environment."
else
  echo "✅ .env file already exists"
fi

# Verify database connection and existence
echo "Checking database connection..."
if command_exists psql; then
  DB_URL=$(grep DATABASE_URL .env | cut -d '=' -f 2)

  # Extract database name from URL
  DB_NAME=$(echo $DB_URL | awk -F'/' '{print $NF}' | awk -F'?' '{print $1}')

  # Extract host, port, user from URL (simplified, assumes standard format)
  DB_HOST=$(echo $DB_URL | awk -F'@' '{print $2}' | awk -F':' '{print $1}')
  DB_PORT=$(echo $DB_URL | awk -F':' '{print $NF}' | awk -F'/' '{print $1}')
  DB_USER=$(echo $DB_URL | awk -F'//' '{print $2}' | awk -F':' '{print $1}')

  # Check if database exists
  if PGPASSWORD=postgres psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "✅ Database '$DB_NAME' already exists"
  else
    echo "⚠️  Database '$DB_NAME' does not exist. Attempting to create it..."
    if PGPASSWORD=postgres psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;"; then
      echo "✅ Database '$DB_NAME' created successfully"
    else
      echo "❌ Failed to create database. You may need to create it manually."
      echo "   Command: CREATE DATABASE $DB_NAME;"
    fi
  fi
else
  echo "⚠️  Skipping database checks (psql not found)"
fi

# Run database migrations
echo "Running database migrations..."
npm run build
node dist/db/migrate.js
if [ $? -ne 0 ]; then
  echo "⚠️  Database migration failed. Application may not work correctly."
else
  echo "✅ Database migration completed successfully"
fi

# Check if port 3000 is already in use
if command_exists lsof; then
  PORT_IN_USE=$(lsof -i :3000 -t)
  if [ -n "$PORT_IN_USE" ]; then
    echo "⚠️  WARNING: Port 3000 is already in use by process(es): $PORT_IN_USE"
    echo "You have a few options:"
    echo "  1. Kill the existing process: kill -9 $PORT_IN_USE"
    echo "  2. Use a different port by updating the PORT value in .env"

    read -p "Would you like to use a different port? (y/n): " USE_DIFFERENT_PORT
    if [[ $USE_DIFFERENT_PORT == "y" ]]; then
      read -p "Enter a new port number: " NEW_PORT
      # Update .env file with new port
      sed -i "" "s/PORT=.*/PORT=$NEW_PORT/" .env
      echo "✅ Updated PORT to $NEW_PORT in .env"
    else
      echo "⚠️  Starting the app anyway, but it might fail if port 3000 is still in use"
    fi
  else
    echo "✅ Port 3000 is available"
  fi
else
  echo "⚠️  Cannot check if port is in use (lsof not available)"
fi

# Start the application
echo ""
echo "===== Starting Cardano Blockchain Scanner ====="
echo "Use Ctrl+C to stop the application"
echo ""

# Use development mode to enable automatic reloading
npm run dev

# Exit message (will only show if npm run dev is terminated)
echo ""
echo "===== Cardano Blockchain Scanner Stopped ====="
