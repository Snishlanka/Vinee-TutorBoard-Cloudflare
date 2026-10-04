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
 await p.setViewportSize({width:1440,height:900});
 await p.waitForTimeout(80);
 await p.evaluate(()=>{setTool('move');selected=page().objects[0];syncSelection();render();});
 const initial=await p.evaluate(()=>{const g=selected;return {w:graphPlot(g).w,h:graphPlot(g).h,ranges:[g.xmin,g.xmax,g.ymin,g.ymax,g.xTickStep,g.yTickStep,g.gridSubdivisionsX,g.gridSubdivisionsY]};});
 for(const corner of [[1,1],[0,0]]){
  const start=await p.evaluate(([u,v])=>{const handle=selectionHandles(selected).find(h=>h.u===u&&h.v===v),r=canvas.getBoundingClientRect();return {x:r.left+handle.x/W*r.width,y:r.top+handle.y/H*r.height};},corner);
  await p.mouse.move(start.x,start.y);await p.mouse.down();
  await p.mouse.move(start.x+(corner[0]?30:-30),start.y+(corner[1]?40:-40),{steps:5});await p.mouse.up();
  assert.deepEqual(await p.evaluate(()=>{const g=selected;return [g.xmin,g.xmax,g.ymin,g.ymax,g.xTickStep,g.yTickStep,g.gridSubdivisionsX,g.gridSubdivisionsY];}),initial.ranges);
  assert.ok(await p.evaluate(()=>validObject(selected)));
 }
 assert.ok(await p.evaluate(w=>graphPlot(selected).w>w,initial.w));
 assert.ok(await p.evaluate(()=>{const g=selected,b=objectBounds(g),plot=graphPlot(g);return Math.abs(b.right-g.x-plot.w-84)<1e-6&&!hit(g,{x:b.right+30,y:g.y+100});}));
 await p.locator('#undo').click();await p.locator('#redo').click();
 assert.deepEqual(errors,[]);console.log('Compact graph bounds and corner resizing preserve ranges, intervals, square units, lens mapping and history.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
