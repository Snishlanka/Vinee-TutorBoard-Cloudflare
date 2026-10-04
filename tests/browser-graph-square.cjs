const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8765/whiteboard.html');await p.waitForFunction(()=>window.TutorBoard);
 await p.evaluate(()=>{ $('xmin').value=-2;$('xmax').value=4;$('ymin').value=-5;$('ymax').value=6;$('functions').value='(x+1)*(x-3)';insertGraph(); });
 for(const [width,height] of [[1366,768],[1920,1080],[800,1100]]){
  await p.setViewportSize({width,height});
  for(const shown of [true,false]){
   await p.evaluate(shown=>{document.body.classList.toggle('tools-hidden',!shown);syncPanels();},shown);
   await p.waitForTimeout(80);
   const result=await p.evaluate(()=>{const g=page().objects[0],b=graphPlot(g),r=canvas.getBoundingClientRect();
    const unitX=b.w/(g.xmax-g.xmin)*r.width/W,unitY=b.h/(g.ymax-g.ymin)*r.height/H;
    const point={x:b.left+(0-g.xmin)/(g.xmax-g.xmin)*b.w,y:b.top+(g.ymax-0)/(g.ymax-g.ymin)*b.h};
    showGraphLens(g,point,{clientX:300,clientY:300});const mapped=lensPointAt(300,300);hideGraphLens();
    return {unitX,unitY,x:mapped.x,y:mapped.y,inside:insideGraphPlot(g,point)};});
   assert.ok(Math.abs(result.unitX-result.unitY)<1e-6,JSON.stringify(result));
   assert.ok(Math.abs(result.x)<1e-8&&Math.abs(result.y)<1e-8);
   assert.ok(result.inside);
  }
 }
 assert.deepEqual(errors,[]);console.log('Square graph units across 3 screens and panel states, with correct lens mapping.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
