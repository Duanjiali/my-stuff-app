// 显式声明 ejs：Express 在运行期动态加载模板引擎（app.set('view engine')），
// 打包器静态分析追踪不到该依赖，必须在此显式 require 以确保 ejs 进入函数包
require('ejs');
const serverless = require('serverless-http');
const { createApp } = require('../../src/app');

let handlerPromise = null;

module.exports.handler = async (event, context) => {
  if (!handlerPromise) {
    handlerPromise = createApp().then((app) => serverless(app));
  }
  const handler = await handlerPromise;
  return handler(event, context);
};
