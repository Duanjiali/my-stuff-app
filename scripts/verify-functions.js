// 发布前检查：直接调用 Netlify Functions 入口，验证 serverless-http 链路可用
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mystuff123';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-verify';
const { handler } = require('../netlify/functions/server');

(async () => {
  const mk = (path, method = 'GET') => ({
    httpMethod: method,
    path,
    headers: { host: 'localhost' },
    isBase64Encoded: false,
  });
  const login = await handler(mk('/login'), {});
  console.log('functions GET /login ->', login.statusCode, '(期望 200)');
  const css = await handler(mk('/css/style.css'), {});
  console.log('functions GET /css/style.css ->', css.statusCode, '(期望 200，publish 静态直出)');
  const auth = await handler(mk('/'), {});
  console.log('functions GET / 未登录 ->', auth.statusCode, '(期望 302)');
  const ok = login.statusCode === 200 && css.statusCode === 200 && auth.statusCode === 302;
  console.log(ok ? 'serverless 链路验证通过' : 'serverless 链路验证失败');
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
