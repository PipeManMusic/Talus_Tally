# Deployment Guide

**Version:** 1.0  
**Last Updated:** January 28, 2026  
**Target Environments:** Development, Staging, Production

---

## Table of Contents

1. [Overview](#overview)
2. [Development Setup](#development-setup)
3. [Production Architecture](#production-architecture)
4. [Environment Configuration](#environment-configuration)
5. [Application Deployment](#application-deployment)
6. [WebSocket Scaling](#websocket-scaling)
7. [Monitoring & Logging](#monitoring--logging)
8. [Security](#security)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers deploying the Talus Tally backend API for development, staging, and production environments.

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 2 GB
- Storage: 10 GB
- Python: 3.9+
- OS: Linux (Ubuntu 20.04+), macOS, Windows

**Recommended (Production):**
- CPU: 4+ cores
- RAM: 8 GB
- Storage: 50 GB SSD
- Python: 3.11+
- OS: Linux (Ubuntu 22.04 LTS)

---

## Development Setup

### Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/talus-tally.git
cd talus-tally

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
python run_app.py
```

Application runs on `http://localhost:5000`

### Development Server Options

```bash
# Run with auto-reload (default)
python run_app.py

# Run with debug mode
FLASK_DEBUG=1 python run_app.py

# Run on custom port
python run_app.py --port 8000

# Run with specific host
python run_app.py --host 0.0.0.0
```

### Docker Development

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["python", "run_app.py"]
```

```bash
# Build and run
docker build -t talus-tally .
docker run -p 5000:5000 talus-tally
```

---

## Production Architecture

### Recommended Stack

```
┌─────────────────────────────────────────────────┐
│              Load Balancer (nginx)              │
│         SSL Termination, Static Files           │
└────────────┬────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼────┐       ┌───▼────┐
│ App    │       │ App    │
│ Server │       │ Server │
│ (WSGI) │       │ (WSGI) │
└───┬────┘       └───┬────┘
    │                │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │  Redis (PubSub) │
    │ Socket.IO Adapter│
    └─────────────────┘
```

### Components

1. **nginx**: Reverse proxy, SSL termination, static file serving
2. **gunicorn**: WSGI application server (multiple workers)
3. **gevent-socketio**: Async WebSocket support
4. **Redis**: Socket.IO message broker for multi-worker scaling
5. **systemd**: Process management

---

## Environment Configuration

### Environment Variables

Create `.env` file:

```bash
# Application
FLASK_ENV=production
SECRET_KEY=your-secret-key-here-change-this
APP_PORT=5000
APP_HOST=0.0.0.0

# Session Management
SESSION_CLEANUP_INTERVAL=3600  # 1 hour in seconds
SESSION_MAX_INACTIVE_HOURS=24

# Logging
LOG_LEVEL=INFO
LOG_FILE=/var/log/talus-tally/app.log

# CORS (adjust for your frontend domain)
CORS_ORIGINS=https://app.yourcompany.com,https://www.yourcompany.com

# Redis (for WebSocket scaling)
REDIS_URL=redis://localhost:6379/0

# Performance
MAX_CONTENT_LENGTH=16777216  # 16MB
GUNICORN_WORKERS=4
GUNICORN_THREADS=2
GUNICORN_TIMEOUT=30
```

### Loading Environment Variables

```python
# backend/app.py
import os
from dotenv import load_dotenv

load_dotenv()

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key')
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 16777216))

# CORS configuration
cors_origins = os.getenv('CORS_ORIGINS', '*').split(',')
CORS(app, origins=cors_origins)
```

---

## Application Deployment

### Production WSGI Server (gunicorn)

Install gunicorn:

```bash
pip install gunicorn gevent gevent-websocket
```

Create `gunicorn_config.py`:

```python
import os
import multiprocessing

# Server socket
bind = f"{os.getenv('APP_HOST', '0.0.0.0')}:{os.getenv('APP_PORT', '5000')}"
backlog = 2048

# Worker processes
workers = int(os.getenv('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))
worker_class = 'geventwebsocket.gunicorn.workers.GeventWebSocketWorker'
worker_connections = 1000
timeout = int(os.getenv('GUNICORN_TIMEOUT', 30))
keepalive = 2

# Logging
accesslog = os.getenv('ACCESS_LOG', '/var/log/talus-tally/access.log')
errorlog = os.getenv('ERROR_LOG', '/var/log/talus-tally/error.log')
loglevel = os.getenv('LOG_LEVEL', 'info')

# Process naming
proc_name = 'talus-tally'

# Server mechanics
daemon = False  # Managed by systemd
pidfile = '/var/run/talus-tally.pid'
umask = 0o007
user = None
group = None
tmp_upload_dir = None
```

Run with gunicorn:

```bash
gunicorn -c gunicorn_config.py 'backend.app:create_app()'
```

### systemd Service

Create `/etc/systemd/system/talus-tally.service`:

```ini
[Unit]
Description=Talus Tally API Server
After=network.target

[Service]
Type=notify
User=talus
Group=talus
WorkingDirectory=/opt/talus-tally
Environment="PATH=/opt/talus-tally/venv/bin"
EnvironmentFile=/opt/talus-tally/.env
ExecStart=/opt/talus-tally/venv/bin/gunicorn -c gunicorn_config.py 'backend.app:create_app()'
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true

# Restart policy
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Manage service:

```bash
# Enable and start
sudo systemctl enable talus-tally
sudo systemctl start talus-tally

# Check status
sudo systemctl status talus-tally

# View logs
sudo journalctl -u talus-tally -f

# Restart
sudo systemctl restart talus-tally

# Reload (graceful restart)
sudo systemctl reload talus-tally
```

### nginx Configuration

Create `/etc/nginx/sites-available/talus-tally`:

```nginx
upstream talus_tally {
    # Multiple workers for load balancing
    server 127.0.0.1:5000;
    # Add more workers if using multiple gunicorn instances
    # server 127.0.0.1:5001;
    # server 127.0.0.1:5002;
}

server {
    listen 80;
    server_name api.yourcompany.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourcompany.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourcompany.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/talus-tally-access.log;
    error_log /var/log/nginx/talus-tally-error.log;

    # Max upload size
    client_max_body_size 16M;

    # Proxy settings
    location /api {
        proxy_pass http://talus_tally;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /socket.io {
        proxy_pass http://talus_tally/socket.io;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # WebSocket timeout (keep connections alive)
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://talus_tally/health;
        access_log off;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/talus-tally /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL/TLS with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.yourcompany.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

---

## WebSocket Scaling

### Redis Setup for Socket.IO

Install Redis:

```bash
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

Configure Redis (`/etc/redis/redis.conf`):

```conf
# Bind to localhost only (if on same server)
bind 127.0.0.1

# Set password
requirepass your-redis-password-here

# Memory limit
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence (optional for session data)
save 900 1
save 300 10
save 60 10000
```

### Socket.IO Redis Adapter

Install Python Redis client:

```bash
pip install redis
```

Configure in `backend/app.py`:

```python
import os
from flask_socketio import SocketIO
import redis

# Create Redis client
redis_client = redis.from_url(
    os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
    decode_responses=True
)

# Initialize Socket.IO with Redis
socketio = SocketIO(
    app,
    cors_allowed_origins=os.getenv('CORS_ORIGINS', '*').split(','),
    message_queue=os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
    async_mode='gevent'
)
```

### Multi-Worker Configuration

Run multiple gunicorn workers on different ports:

```bash
# Worker 1
gunicorn -c gunicorn_config.py --bind 127.0.0.1:5000 'backend.app:create_app()'

# Worker 2
gunicorn -c gunicorn_config.py --bind 127.0.0.1:5001 'backend.app:create_app()'

# Worker 3
gunicorn -c gunicorn_config.py --bind 127.0.0.1:5002 'backend.app:create_app()'
```

Update nginx upstream:

```nginx
upstream talus_tally {
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    server 127.0.0.1:5002;
}
```

---

## Monitoring & Logging

### Application Logging

Configure structured logging in `backend/infra/logging.py`:

```python
import logging
import os
from logging.handlers import RotatingFileHandler
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            'timestamp': self.formatTime(record),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        if record.exc_info:
            log_obj['exception'] = self.formatException(record.exc_info)
        
        return json.dumps(log_obj)

def setup_logging(app):
    log_level = os.getenv('LOG_LEVEL', 'INFO')
    log_file = os.getenv('LOG_FILE', '/var/log/talus-tally/app.log')
    
    # Create log directory if it doesn't exist
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    
    # File handler (JSON format)
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10485760,  # 10MB
        backupCount=10
    )
    file_handler.setFormatter(JSONFormatter())
    file_handler.setLevel(log_level)
    
    # Console handler (human-readable)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(
        logging.Formatter('[%(asctime)s] %(levelname)s in %(module)s: %(message)s')
    )
    console_handler.setLevel(log_level)
    
    # Configure app logger
    app.logger.addHandler(file_handler)
    app.logger.addHandler(console_handler)
    app.logger.setLevel(log_level)
    
    # Disable default Flask logger
    app.logger.propagate = False
```

### Health Check Endpoint

Add to `backend/api/routes.py`:

```python
@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for load balancers."""
    try:
        # Check Redis connection
        redis_client.ping()
        redis_status = 'healthy'
    except Exception as e:
        redis_status = 'unhealthy'
        app.logger.error(f'Redis health check failed: {e}')
    
    return jsonify({
        'status': 'healthy' if redis_status == 'healthy' else 'degraded',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'api': 'healthy',
            'redis': redis_status
        }
    }), 200 if redis_status == 'healthy' else 503
```

### Prometheus Metrics (Optional)

Install prometheus client:

```bash
pip install prometheus-flask-exporter
```

Configure in `backend/app.py`:

```python
from prometheus_flask_exporter import PrometheusMetrics

metrics = PrometheusMetrics(app)

# Custom metrics
session_counter = metrics.counter(
    'talus_tally_sessions_total',
    'Total number of sessions created'
)

command_counter = metrics.counter(
    'talus_tally_commands_total',
    'Total number of commands executed',
    labels={'command_type': lambda: request.json.get('command_type', 'unknown')}
)
```

Expose metrics at `/metrics` endpoint.

### Log Aggregation

**ELK Stack (Elasticsearch, Logstash, Kibana):**

```bash
# Install Filebeat to ship logs
sudo apt install filebeat

# Configure Filebeat to read JSON logs
# /etc/filebeat/filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/talus-tally/app.log
  json.keys_under_root: true
  json.add_error_key: true

output.elasticsearch:
  hosts: ["localhost:9200"]
```

**CloudWatch (AWS):**

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb

# Configure agent to ship logs
# /opt/aws/amazon-cloudwatch-agent/etc/config.json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/talus-tally/app.log",
            "log_group_name": "/aws/talus-tally/app",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
```

---

## Security

### Secrets Management

**Option 1: Environment Variables**

```bash
# Generate secure secret key
python -c 'import secrets; print(secrets.token_hex(32))'

# Add to .env (never commit to git)
SECRET_KEY=your-generated-secret-key
```

**Option 2: AWS Secrets Manager**

```python
import boto3
import json

def get_secret(secret_name):
    client = boto3.client('secretsmanager', region_name='us-east-1')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

secrets = get_secret('talus-tally/production')
app.config['SECRET_KEY'] = secrets['SECRET_KEY']
```

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Deny direct access to application port
sudo ufw deny 5000/tcp
```

### Rate Limiting

Install Flask-Limiter:

```bash
pip install Flask-Limiter
```

Configure:

```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri=os.getenv('REDIS_URL', 'redis://localhost:6379/0')
)

# Apply to endpoints
@bp.route('/commands/execute', methods=['POST'])
@limiter.limit("100 per minute")
def execute_command():
    # ...
```

### Security Headers

Already configured in nginx (see nginx configuration above).

---

## Backup & Recovery

### Session Data Backup

Since sessions are in-memory, implement Redis persistence:

```conf
# /etc/redis/redis.conf
save 900 1
save 300 10
save 60 10000

appendonly yes
appendfsync everysec
```

Backup Redis data:

```bash
#!/bin/bash
# backup_redis.sh

BACKUP_DIR=/backups/redis
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Copy Redis dump
cp /var/lib/redis/dump.rdb $BACKUP_DIR/dump_$DATE.rdb

# Keep last 7 days of backups
find $BACKUP_DIR -name "dump_*.rdb" -mtime +7 -delete
```

Schedule with cron:

```bash
# Daily backup at 2 AM
0 2 * * * /opt/talus-tally/scripts/backup_redis.sh
```

### Application Code Backup

```bash
#!/bin/bash
# backup_app.sh

BACKUP_DIR=/backups/talus-tally
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR=/opt/talus-tally

# Create backup
tar -czf $BACKUP_DIR/app_$DATE.tar.gz -C /opt talus-tally

# Upload to S3 (if using AWS)
aws s3 cp $BACKUP_DIR/app_$DATE.tar.gz s3://your-bucket/backups/

# Keep last 30 days
find $BACKUP_DIR -name "app_*.tar.gz" -mtime +30 -delete
```

### Disaster Recovery

**Recovery Procedure:**

1. Restore application code:
```bash
tar -xzf app_backup.tar.gz -C /opt/
```

2. Restore Redis data:
```bash
sudo systemctl stop redis-server
cp dump_backup.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb
sudo systemctl start redis-server
```

3. Restart application:
```bash
sudo systemctl restart talus-tally
```

---

## Troubleshooting

### Common Issues

#### 1. WebSocket Connection Fails

**Symptom:** Socket.IO clients can't connect

**Solutions:**
```bash
# Check if application is listening
sudo netstat -tlnp | grep 5000

# Check nginx WebSocket proxy
sudo nginx -t
sudo tail -f /var/log/nginx/error.log

# Verify gunicorn worker class
ps aux | grep gunicorn
# Should show: geventwebsocket.gunicorn.workers.GeventWebSocketWorker
```

#### 2. Sessions Not Persisting

**Symptom:** Sessions lost after application restart

**Solution:** Ensure Redis is configured and running:
```bash
sudo systemctl status redis-server
redis-cli ping  # Should return PONG
```

#### 3. High Memory Usage

**Symptom:** Application consuming excessive memory

**Solutions:**
```bash
# Check number of sessions
redis-cli DBSIZE

# Cleanup old sessions
curl -X POST http://localhost:5000/api/v1/sessions/cleanup

# Adjust worker count in gunicorn_config.py
# Reduce workers or use threading instead
```

#### 4. Slow Response Times

**Symptom:** API endpoints responding slowly

**Solutions:**
```bash
# Check application logs
sudo journalctl -u talus-tally -n 100

# Monitor resource usage
htop

# Check nginx access log for slow requests
sudo tail -f /var/log/nginx/access.log | grep -v "0.0[0-9][0-9]"

# Profile application (development only)
pip install flask-profiler
```

#### 5. SSL Certificate Issues

**Symptom:** HTTPS not working

**Solutions:**
```bash
# Verify certificate
sudo certbot certificates

# Renew certificate
sudo certbot renew

# Check nginx SSL configuration
sudo nginx -t
```

### Debugging Tools

```bash
# View application logs
sudo journalctl -u talus-tally -f

# Check all services
sudo systemctl status talus-tally nginx redis-server

# Monitor connections
sudo netstat -an | grep :5000

# Check gunicorn workers
ps aux | grep gunicorn

# Redis CLI
redis-cli
> KEYS *
> GET session:xyz
> DBSIZE
```

---

## Performance Tuning

### gunicorn Workers

```python
# gunicorn_config.py
import multiprocessing

# CPU-bound: workers = 2 * CPU_count + 1
workers = multiprocessing.cpu_count() * 2 + 1

# I/O-bound: More workers
# workers = multiprocessing.cpu_count() * 4 + 1

# Memory consideration: Each worker ~50-100MB
# For 8GB server: max 40-80 workers
```

### Redis Optimization

```conf
# /etc/redis/redis.conf

# Increase max clients
maxclients 10000

# Adjust memory policy
maxmemory 1gb
maxmemory-policy allkeys-lru

# Disable persistence for cache-only use (faster)
save ""
appendonly no
```

### nginx Tuning

```nginx
# /etc/nginx/nginx.conf

worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Caching
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    
    # Compression
    gzip on;
    gzip_types application/json text/plain text/css application/javascript;
    gzip_min_length 1000;
    
    # Keep-alive
    keepalive_timeout 65;
    keepalive_requests 100;
}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Review and update environment variables
- [ ] Generate secure SECRET_KEY
- [ ] Configure CORS_ORIGINS for production domain
- [ ] Test SSL certificate
- [ ] Configure firewall rules
- [ ] Set up log rotation
- [ ] Configure backup scripts
- [ ] Test disaster recovery procedure

### Deployment

- [ ] Deploy application code
- [ ] Run database migrations (if applicable)
- [ ] Restart application service
- [ ] Verify health check endpoint
- [ ] Test WebSocket connection
- [ ] Monitor application logs for errors
- [ ] Run smoke tests

### Post-Deployment

- [ ] Monitor error logs for 24 hours
- [ ] Check performance metrics
- [ ] Verify backup execution
- [ ] Update documentation
- [ ] Notify team of deployment

---

## Next Steps

- Review [API Contract](API_CONTRACT.md) for endpoint documentation
- See [Integration Guide](INTEGRATION_GUIDE.md) for frontend development
- Read [WebSocket Protocol](WEBSOCKET_PROTOCOL.md) for real-time events
- Check [Master Plan](MASTER_PLAN.md) for system architecture

---

**Last Updated:** January 28, 2026  
**API Version:** 1.0  
**Status:** ✅ Production Ready
