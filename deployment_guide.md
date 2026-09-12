# OneMapan Deployment Guide for Ubuntu VPS

## Overview
This guide covers deploying the OneMapan application on an Ubuntu VPS with PostgreSQL as the database, following the existing architecture.

## Prerequisites

### Server Requirements
- Ubuntu 20.04 or 22.04 LTS
- Minimum 2GB RAM (4GB recommended)
- Minimum 20GB disk space
- Root or sudo access

### Software Requirements
- Node.js (v20+)
- PostgreSQL (v14+)
- Nginx (optional, for reverse proxy)
- PM2 (for process management)
- Git

## Step 1: Server Initialization

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Required Packages
```bash
sudo apt install -y curl git ufw fail2ban
```

### Set Up UFW Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Step 2: Install Node.js

### Using NVM (Recommended)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
nvm use 20
```

### Verify Installation
```bash
node --version
npm --version
```

## Step 3: Install and Configure PostgreSQL

### Install PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
```

### Start and Enable PostgreSQL
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Create Database and User
```bash
sudo -u postgres createuser -s onemapan
sudo -u postgres createdb one_mapan
```

### Secure PostgreSQL
```bash
sudo -u postgres psql -c "ALTER USER onemapan WITH PASSWORD 'strong_password';"
```

### Test PostgreSQL Connection
```bash
psql -U onemapan -d one_mapan -h localhost
```

## Step 4: Prepare Application Code

### Clone Repository
```bash
git clone https://github.com/your-org/onemapan.git
cd onemapan
```

### Install Dependencies
```bash
npm install
```

### Environment Configuration
```bash
cp .env.example .env
```

### Configure .env File
Edit `.env` with production settings:
```
PORT=2025
DATABASE_URL="postgresql://onemapan:strong_password@localhost:5432/one_mapan"
JWT_SECRET=your_secure_jwt_secret_here
JWT_EXPIRES_IN=1d
SERVER_BASE_URL=https://your-domain.com
NODE_ENV=production
```

### Generate Prisma Client
```bash
npx prisma generate
```

### Run Database Migrations
```bash
npx prisma migrate deploy
```

## Step 5: Build Application

### TypeScript Build
```bash
npm run build
```

### Verify Build Output
```bash
ls -la dist/
```

## Step 6: Set Up Process Management with PM2

### Install PM2 Globally
```bash
sudo npm install -g pm2
```

### Start Application
```bash
pm2 start dist/index.ts --name "onemapan" --watch false
```

### Save PM2 Process
```bash
pm2 save
pm2 startup systemd
```

### Check PM2 Status
```bash
pm2 list
pm2 logs onemapan
```

## Step 7: Configure Nginx (Optional but Recommended)

### Install Nginx
```bash
sudo apt install -y nginx
```

### Enable Nginx
```bash
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Create Nginx Configuration
Create `/etc/nginx/sites-available/onemapan`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:2025;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Serve static files from Next.js frontend if applicable
    location /api/ {
        proxy_pass http://localhost:2025;
    }
}
```

### Enable Configuration
```bash
sudo ln -s /etc/nginx/sites-available/onemapan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 8: Set Up SSL with Let's Encrypt (Optional)

### Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain SSL Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

### Auto-Renewal
Certbot is typically set up as a cron job automatically. Verify:
```bash
sudo certbot renew --dry-run
```

## Step 9: Set Up System Services

### Create Systemd Service File
Create `/etc/systemd/system/onemapan.service`:
```ini
[Unit]
Description=OneMapan Application
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/path/to/onemapan/backend
ExecStart=/usr/bin/node /path/to/onemapan/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=2025
Environment=DATABASE_URL="postgresql://onemapan:password@localhost:5432/one_mapan"
Environment=JWT_SECRET=your_secret
Environment=SERVER_BASE_URL=https://your-domain.com

[Install]
WantedBy=multi-user.target
```

### Enable Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable onemapan
sudo systemctl start onemapan
```

### Check Service Status
```bash
sudo systemctl status onemapan
sudo journalctl -u onemapan -f
```

## Step 10: Database Backup Strategy

### Create Backup Script
Create `/usr/local/bin/backup_onemapan.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/onemapan"
DATE=$(date +%Y%m%d_%H%M%S)
DB_USER="onemapan"
DB_NAME="one_mapan"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create database backup
pg_dump -U $DB_USER -d $DB_NAME > $BACKUP_DIR/onemapan_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/onemapan_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "onemapan_*.sql.gz" -mtime +30 -delete
```

### Make Script Executable
```bash
sudo chmod +x /usr/local/bin/backup_onemapan.sh
```

### Add Cron Job for Daily Backups
```bash
0 2 * * * /usr/local/bin/backup_onemapan.sh
```

## Step 11: Security Hardening

### Set Up Fail2Ban
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Create Fail2Ban Filter
Create `/etc/fail2ban/filter.d/onemapan.conf`:
```ini
[Definition]
failregex=.*Failed login attempt.*
maxretry=3
findtime=600
bantime=3600
```

### Create Fail2Ban Jail
Create `/etc/fail2ban/jail.d/onemapan.conf`:
```ini
[onemapan]
enabled = true
filter = onemapan
port = ssh
logpath = /var/log/auth.log
maxretry = 3
```

### Regular Security Updates
```bash
sudo apt update && sudo apt upgrade -y
sudo apt dist-upgrade -y
```

## Step 12: Monitoring and Logging

### Install Logrotate
```bash
sudo apt install -y logrotate
```

### Create Logrotate Configuration
Create `/etc/logrotate.d/onemapan`:
```bash
/var/log/pm2.log /var/log/onemapan*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
}
```

### Set Up Uptime Monitoring
Consider using:
- UptimeRobot (free)
- Pingdom
- Custom Node.js health endpoint: `GET /api/health`

## Troubleshooting Common Issues

### 1. Prisma Migration Errors
```bash
# Reset migrations and reapply
npx prisma migrate reset --force
npx prisma migrate deploy
```

### 2. Permission Issues
```bash
# Ensure correct permissions
chown -R $USER:$USER /path/to/onemapan
chmod -R 755 /path/to/onemapan/backend/dist
```

### 3. Memory Issues
```bash
# Check memory usage
pm2 monit

# Restart with more memory if needed
pm2 restart onemapan --max-memory 1G
```

### 4. Database Connection Issues
```bash
# Test connection
psql -U onemapan -d one_mapan -h localhost

# Check PostgreSQL is running
sudo systemctl status postgresql
```

### 5. Port Already in Use
```bash
# Check what's using port 2025
sudo lsof -i :2025

# Kill process if needed
sudo kill -9 $(sudo lsof -t -i:2025)
```

## Deployment Checklist

- [ ] Server updated and secured
- [ ] Node.js installed and configured
- [ ] PostgreSQL installed with proper database/user
- [ ] Application code cloned and dependencies installed
- [ ] Environment variables configured
- [ ] Prisma migrations applied
- [ ] Application built successfully
- [ ] Process manager (PM2/systemd) configured
- [ ] Nginx configured (if using reverse proxy)
- [ ] SSL certificate obtained (if using HTTPS)
- [ ] Backup strategy implemented
- [ ] Security hardening completed
- [ ] Monitoring set up
- [ ] Test all API endpoints
- [ ] Verify frontend connectivity

## Rollback Plan

1. Keep previous deployment artifacts
2. Use PM2: `pm2 delete onemapan && pm2 start dist/index.ts --name "onemapan"`
3. Database: `npx prisma migrate reset --target <previous_migration>`
4. DNS: Revert to previous domain/SSL if needed

## VPS Provider Recommendations

- **DigitalOcean**: Good documentation, easy setup
- **Linode**: Stable performance, good support
- **AWS EC2**: Scalable, but more complex setup
- **Hetzner**: Cost-effective, good value

## Post-Deployment Tasks

1. Test all critical functionality
2. Verify database backups work
3. Set up error tracking (Sentry, etc.)
4. Configure log aggregation
5. Document any custom configurations
6. Set up team access if needed

---
*Last Updated: 2026-09-12*
*For OneMapan Backend Application*