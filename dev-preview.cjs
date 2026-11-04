#!/usr/bin/env node
/* Dev preview server — serves the app exactly like the in-desktop LAN server
   (js/lan-server.cjs), so what you see in the browser is what the phone PWA
   and the Windows build get. No build step, no dependencies.

   Usage:  npm run preview        → http://localhost:8484
           PORT=3000 npm run preview
*/
'use strict';
const path = require('path');
const { start, lanIP } = require('./js/lan-server.cjs');

const port = Number(process.env.PORT || 8484);
const rootDir = __dirname;

start({ rootDir, port }).then(api => {
  const info = api.info();
  console.log('VicTech PMS — preview');
  console.log(`  local : http://localhost:${info.port}`);
  console.log(`  network: http://${lanIP()}:${info.port}  (phone on the same Wi-Fi)`);
  console.log('  Ctrl+C to stop');
}).catch(e => {
  console.error('Could not start the preview server:', e.message);
  process.exit(1);
});
