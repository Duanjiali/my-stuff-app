require('dotenv').config();

const path = require('path');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  isProd: process.env.NODE_ENV === 'production',

  adminPassword: process.env.ADMIN_PASSWORD || 'mystuff123',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',

  // 本地无 Turso env 时自动降级为本地 SQLite 文件，同一套 API
  databaseUrl: process.env.TURSO_DATABASE_URL || 'file:data/local.db',
  dbAuthToken: process.env.TURSO_AUTH_TOKEN || '',

  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  uploadsDir: path.join(process.cwd(), 'data', 'uploads'),
};

module.exports = config;
