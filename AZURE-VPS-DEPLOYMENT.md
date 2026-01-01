# Deployment Guide: SafeSpace ke Azure VPS Ubuntu 22

## 📋 Prasyarat

- VPS Azure dengan Ubuntu 22.04 LTS
- Domain name (opsional, tapi direkomendasikan)
- Akses SSH ke VPS
- Akun Supabase yang sudah di-setup

## 🚀 Quick Deployment

### 1. Login ke VPS

```bash
ssh username@your-vps-ip
```

### 2. Upload Project ke VPS

**Opsi A: Menggunakan Git**
```bash
cd /var/www
sudo git clone https://github.com/23041450154/projek-esay.git safespace
cd safespace
```

**Opsi B: Menggunakan SCP (dari komputer lokal)**
```bash
# Di komputer Windows, gunakan PowerShell atau Git Bash
scp -r "path/to/project/*" username@your-vps-ip:/var/www/safespace/
```

### 3. Jalankan Script Deploy

```bash
cd /var/www/safespace
sudo chmod +x deploy.sh
sudo ./deploy.sh
```

## 📝 Manual Deployment (Step by Step)

### Step 1: Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

### Step 3: Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Step 4: Install PM2

```bash
sudo npm install -g pm2
```

### Step 5: Setup Application Directory

```bash
sudo mkdir -p /var/www/safespace
sudo mkdir -p /var/log/pm2
cd /var/www/safespace
```

### Step 6: Upload/Clone Project Files

```bash
# Clone dari GitHub
sudo git clone https://github.com/23041450154/projek-esay.git .

# Atau upload files secara manual
```

### Step 7: Install Dependencies

```bash
cd /var/www/safespace
sudo npm install --production
```

### Step 8: Configure Environment Variables

```bash
sudo cp .env.example .env
sudo nano .env
```

Edit `.env` dengan nilai yang benar:

```env
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here

JWT_SECRET=your_super_secure_random_string_here
VALID_INVITE_CODES=SAFESPACE2024,RUANGAMAN2024

ADMIN_JWT_SECRET=another_super_secure_random_string
```

### Step 9: Configure Nginx

```bash
# Edit nginx config
sudo nano /var/www/safespace/nginx.conf
# Ganti 'yourdomain.com' dengan domain Anda atau IP VPS

# Copy ke sites-available
sudo cp /var/www/safespace/nginx.conf /etc/nginx/sites-available/safespace

# Enable site
sudo ln -s /etc/nginx/sites-available/safespace /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

### Step 10: Start Application dengan PM2

```bash
cd /var/www/safespace
pm2 start ecosystem.config.json --env production
pm2 save
pm2 startup
```

### Step 11: Setup Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

## 🔐 Setup SSL dengan Let's Encrypt

### 1. Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Generate SSL Certificate

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 3. Auto-renewal Test

```bash
sudo certbot renew --dry-run
```

## 🔧 Konfigurasi Nginx untuk IP (Tanpa Domain)

Jika belum punya domain, edit `/etc/nginx/sites-available/safespace`:

```nginx
server {
    listen 80;
    server_name _;  # Menerima semua request

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # API routes
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # All other routes
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📊 Monitoring & Maintenance

### View Application Status
```bash
pm2 status
```

### View Logs
```bash
pm2 logs safespace
pm2 logs safespace --lines 100
```

### Restart Application
```bash
pm2 restart safespace
```

### Update Application
```bash
cd /var/www/safespace
git pull origin main
npm install --production
pm2 restart safespace
```

### Monitor Resources
```bash
pm2 monit
```

## 🔥 Troubleshooting

### Application tidak bisa start
```bash
# Cek logs
pm2 logs safespace --err

# Cek apakah port sudah digunakan
sudo lsof -i :3000

# Test manual
cd /var/www/safespace
node server.js
```

### Nginx error
```bash
# Test config
sudo nginx -t

# Cek error log
sudo tail -f /var/log/nginx/error.log
```

### Permission issues
```bash
sudo chown -R www-data:www-data /var/www/safespace
sudo chmod -R 755 /var/www/safespace
```

### Supabase connection error
```bash
# Pastikan environment variables benar
cat /var/www/safespace/.env

# Test koneksi
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"inviteCode":"SAFESPACE2024","displayName":"Test"}'
```

## 📁 Struktur Files

```
/var/www/safespace/
├── server.js              # Express server utama
├── package.json           # Dependencies
├── ecosystem.config.json  # PM2 config
├── nginx.conf            # Nginx config template
├── .env                  # Environment variables (buat manual)
├── api/                  # API handlers
├── public/               # Static files (HTML, CSS, JS)
└── assets/               # Assets (images, etc)
```

## 🎯 Checklist Deployment

- [ ] VPS sudah bisa diakses via SSH
- [ ] Project files sudah di-upload
- [ ] Node.js terinstall (v18+)
- [ ] Nginx terinstall dan running
- [ ] PM2 terinstall globally
- [ ] Dependencies terinstall (`npm install`)
- [ ] File `.env` sudah dikonfigurasi
- [ ] Nginx config sudah di-setup
- [ ] Application running via PM2
- [ ] Firewall sudah dikonfigurasi
- [ ] SSL certificate (jika pakai domain)

## 🆘 Bantuan

Jika mengalami masalah:
1. Cek PM2 logs: `pm2 logs safespace`
2. Cek Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Pastikan semua environment variables sudah benar
4. Pastikan Supabase project aktif dan credentials benar
