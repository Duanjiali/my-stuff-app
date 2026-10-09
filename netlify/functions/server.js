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
