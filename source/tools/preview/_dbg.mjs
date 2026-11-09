import { chromium } from 'playwright-core'
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await (await b.newContext({viewport:{width:844,height:390}})).newPage()
p.on('console',m=>console.log('C',m.type(),m.text().slice(0,300)));p.on('pageerror',e=>console.log('E',String(e)))
await p.goto('http://localhost:8099/tools/preview/index.html?glb=/assets-work/spa_opt_1024.glb&car=/assets-work/w11_car_hi.glb')
await p.waitForFunction(()=>window.__ready,null,{timeout:300000})
console.log(await p.evaluate(()=>[typeof placeCar, typeof __steer, location.search]))
await b.close()
