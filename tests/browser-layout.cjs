const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const p = await browser.newPage();
  await p.goto('http://127.0.0.1:8765');
  await p.waitForFunction(() => window.TutorBoard);
  for (const [width,height] of [[1366,768],[1920,1080],[1536,864],[1024,768],[800,1100]]) {
   await p.setViewportSize({width,height});
   for (const panels of [false,true]) {
    await p.evaluate(panels => {
     document.body.classList.toggle('pages-hidden',!panels);
     document.body.classList.toggle('tools-hidden',!panels);
     setBoardZoom(1); syncPanels();
    },panels);
    await p.waitForTimeout(100);
    const size = await p.evaluate(() => {
     const r = canvas.getBoundingClientRect();
     return {w:r.width,h:r.height,sw:boardStage.clientWidth,sh:boardStage.clientHeight};
    });
    assert.ok(Math.abs(size.w - size.sw + 4) < 2, JSON.stringify(size));
    assert.ok(Math.abs(size.h - size.sh + 4) < 2, JSON.stringify(size));
   }
  }
  await p.evaluate(() => { openTextBox({x:400,y:200,w:520,h:180}); $('text-editor').value='Resize test'; });
  await p.setViewportSize({width:1440,height:900});
  await p.waitForTimeout(100);
  await p.evaluate(() => commitText());
  const box = await p.evaluate(() => page().objects.at(-1));
  assert.ok(Math.abs(box.w-520)<3 && Math.abs(box.h-180)<3,JSON.stringify(box));
  await p.evaluate(() => setBoardZoom(1.5));
  assert.ok(await p.evaluate(() => boardStage.scrollWidth > boardStage.clientWidth));
  console.log('Full available board area passed at five screen sizes with panels open/closed; text resize and zoom passed.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
