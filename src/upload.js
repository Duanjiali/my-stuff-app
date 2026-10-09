// 图片存储：配置了 CLOUDINARY_URL 走云存储，否则本地 data/uploads/（开发用）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

let cloudinary = null;
if (config.cloudinaryUrl) {
  const { v2 } = require('cloudinary');
  v2.config(true); // 从 CLOUDINARY_URL 环境变量读取
  cloudinary = v2;
}

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'my-stuff', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });
}

/**
 * 本地降级存储。注意：Netlify Functions 文件系统只读（仅 /tmp 可写），
 * 写入失败时返回 null（无图保存），保证物品文字数据不受影响。
 */
function saveLocal(buffer, ext) {
  try {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext || 'jpg'}`;
    fs.writeFileSync(path.join(config.uploadsDir, name), buffer);
    return `/uploads/${name}`;
  } catch (err) {
    console.warn('[upload] 本地存储不可用，已跳过图片:', err.code || err.message);
    return null;
  }
}

/**
 * @returns {Promise<string|null>} 图片 URL；存储不可用时返回 null（不阻断保存）
 */
async function saveImage(buffer, mimetype) {
  try {
    if (cloudinary) return await uploadToCloudinary(buffer);
    const ext = (mimetype || '').includes('png') ? 'png' : 'jpg';
    return saveLocal(buffer, ext);
  } catch (err) {
    console.warn('[upload] 图片上传失败，已跳过:', err.message);
    return null;
  }
}

module.exports = { saveImage, useCloudinary: () => !!cloudinary };
