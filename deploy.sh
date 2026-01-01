#!/bin/bash

# =====================================================
# SafeSpace Deployment Script for Azure VPS Ubuntu 22
# =====================================================

set -e

echo "🚀 Starting SafeSpace Deployment..."

# Configuration
APP_NAME="safespace"
APP_DIR="/var/www/safespace"
REPO_URL="https://github.com/23041450154/projek-esay.git"
BRANCH="main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (sudo)"
    exit 1
fi

# Update system
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20 LTS
print_status "Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
node --version
npm --version

# Install Nginx
print_status "Installing Nginx..."
apt install -y nginx

# Install PM2 globally
print_status "Installing PM2..."
npm install -g pm2

# Install Git
print_status "Installing Git..."
apt install -y git

# Create app directory
print_status "Creating application directory..."
mkdir -p $APP_DIR
mkdir -p /var/log/pm2

# Clone or pull repository
if [ -d "$APP_DIR/.git" ]; then
    print_status "Pulling latest changes..."
    cd $APP_DIR
    git pull origin $BRANCH
else
    print_status "Cloning repository..."
    git clone -b $BRANCH $REPO_URL $APP_DIR
fi

cd $APP_DIR

# Install dependencies
print_status "Installing Node.js dependencies..."
npm install --production

# Check if .env file exists
if [ ! -f "$APP_DIR/.env" ]; then
    print_warning ".env file not found!"
    print_warning "Please create .env file with required environment variables"
    print_warning "Copy from .env.example and fill in the values"
    
    if [ -f "$APP_DIR/.env.example" ]; then
        cp $APP_DIR/.env.example $APP_DIR/.env
        print_status "Created .env from .env.example - Please edit it!"
    fi
fi

# Setup Nginx
print_status "Configuring Nginx..."
cp $APP_DIR/nginx.conf /etc/nginx/sites-available/$APP_NAME

# Create symbolic link if not exists
if [ ! -L "/etc/nginx/sites-enabled/$APP_NAME" ]; then
    ln -s /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
fi

# Remove default nginx site
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    rm /etc/nginx/sites-enabled/default
fi

# Test nginx configuration
nginx -t

# Start/Restart Nginx
print_status "Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

# Setup PM2
print_status "Starting application with PM2..."
cd $APP_DIR

# Stop existing process if running
pm2 stop $APP_NAME 2>/dev/null || true
pm2 delete $APP_NAME 2>/dev/null || true

# Start with ecosystem config
pm2 start ecosystem.config.json --env production

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

# Setup firewall
print_status "Configuring firewall..."
ufw allow 'Nginx Full'
ufw allow OpenSSH
ufw --force enable

print_status "Deployment completed!"
echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Edit /var/www/safespace/.env with your actual values"
echo "2. Update nginx.conf with your domain name"
echo "3. Setup SSL with: certbot --nginx -d yourdomain.com"
echo "4. Restart: pm2 restart safespace"
echo ""
echo "Useful commands:"
echo "  - pm2 status              : Check app status"
echo "  - pm2 logs safespace      : View logs"
echo "  - pm2 restart safespace   : Restart app"
echo "  - nginx -t                : Test nginx config"
echo "  - systemctl restart nginx : Restart nginx"
echo "=========================================="
