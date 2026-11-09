import { chromium } from 'playwright-core'
import fs from 'node:fs'
const [,, out='out/app/track', glb='/assets-work/spa_opt_2048.glb', W='844', H='390', plan='tools/preview/corners.json', car=''] = process.argv
fs.mkdirSync(out,{recursive:true})
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await (await b.newContext({viewport:{width:+W,height:+H},deviceScaleFactor:2})).newPage()
const errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))})
await p.goto('http://localhost:8099/tools/preview/index.html?glb='+glb+(car?'&car='+car:''))
await p.waitForFunction(()=>window.__ready,null,{timeout:300000})
console.log(JSON.stringify(await p.evaluate(()=>window.__stats)))
const shots=JSON.parse(fs.readFileSync(plan,'utf8'))
for(const s of shots){ await p.evaluate(s=>{ if(s.car!==undefined){placeCar(s.car,s.lat||0); if(s.steer!==undefined) __steer(s.steer); carCam(s.car,s.cam)} else s.over?overview():shot(s.s,s.mode,s.label) },s); await p.waitForTimeout(300)
  await p.screenshot({path:`${out}/${s.name}.png`}); console.log('shot',s.name) }
console.log('errors',errs.length,errs.slice(0,5).join(' | ')); await b.close()
