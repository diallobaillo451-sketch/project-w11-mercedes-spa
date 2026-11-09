import { chromium } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(); const reqs = []; let ready = false
p.on('requestfinished', async r => { const s = await r.sizes().catch(() => null); reqs.push([ready ? 'after' : 'before', r.url().replace(/^.*:52?99/, '').replace(/^.*5199/, ''), s ? s.responseBodySize : 0]) })
const B = process.argv[2] || 'http://127.0.0.1:5199/'; const cdp = await ctx.newCDPSession(p); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 20e6 / 8, uploadThroughput: 5e6 / 8 }); await p.goto(B); await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 }); ready = true
const log = await p.evaluate(() => window.__w11diag.log)
const bef = reqs.filter(r => r[0] === 'before'); console.log(log.join('\n'))
console.log('avant prêt', (bef.reduce((a, r) => a + r[2], 0) / 1e6).toFixed(1), 'Mo,', bef.length, 'requêtes')
console.log(bef.sort((a, b) => b[2] - a[2]).slice(0, 15).map(r => r[1] + ' ' + (r[2] / 1e6).toFixed(2)).join('\n'))
await b.close()
