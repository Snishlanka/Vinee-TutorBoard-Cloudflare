const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function inspect(expression,x,y=0,settings={}){
 const g={x:0,y:0,w:900,h:650,xmin:-10,xmax:10,ymin:-10,ymax:10,curves:[{expression}],...settings};
 const c=vm.createContext({graphLensState:{graph:g,sx:2,sy:2,center:{x:58+(x+10)/20*816,y:70+(10-y)/20*536}}});
 vm.runInContext(fs.readFileSync('math.js','utf8'),c);
 const source=fs.readFileSync('app.js','utf8');
 vm.runInContext(source.slice(source.indexOf('function lensPointAt('),source.indexOf('function paintGraphLens(')),c);
 vm.runInContext('graphLensState.plot=TutorMath.plotBounds(graphLensState.graph)',c);
 const plot=c.graphLensState.plot;
 c.graphLensState.center={x:plot.left+(x+10)/20*plot.w,y:plot.top+(10-y)/20*plot.h};
 return c.lensPointAt(300,300);
}
test('quadratic vertex snaps to the exact origin from either side',()=>{
 for(const x of [-.1,-.015,-.001,.001,.015,.1]){
  const point=inspect('x^2',x);
  assert.equal(point.x,0);assert.equal(point.y,0);
 }
});
test('small but real nonzero intercepts are not rounded to zero',()=>{
 const point=inspect('x-0.00000001',.00000001);
 assert.ok(Math.abs(point.x-1e-8)<1e-14);assert.notEqual(point.x,0);assert.equal(point.y,0);
});

test('ordinary points snap to the configured minor grid exactly',()=>{
 const p=inspect('100',1.0119,4.9998,{xTickStep:1,yTickStep:1,gridSubdivisionsX:5,gridSubdivisionsY:5});
 assert.equal(p.x,1);assert.equal(p.y,5);assert.equal(p.label,'Grid point');
 const q=inspect('100',-.71,2.23,{xTickStep:.5,yTickStep:2,gridSubdivisionsX:5,gridSubdivisionsY:10});
 assert.equal(q.x,-.7);assert.equal(q.y,2.2);
});
test('nearby maximum and minimum values override grid snapping',()=>{
 let p=inspect('-(x-1)^2+5',1.01,4.99,{xTickStep:1,yTickStep:1,gridSubdivisionsX:5,gridSubdivisionsY:5});
 assert.equal(p.x,1);assert.equal(p.y,5);assert.equal(p.label,'Maximum');
 p=inspect('(x-2)^2+1',2.01,1.01);
 assert.equal(p.x,2);assert.equal(p.y,1);assert.equal(p.label,'Minimum');
});

test('curve points use grid-aligned X and evaluated Y, with grid fallback away from curves',()=>{
 const settings={xTickStep:1,yTickStep:1,gridSubdivisionsX:5,gridSubdivisionsY:5};
 let p=inspect('x^2',1.19,1.44,settings);
 assert.equal(p.label,'On curve');assert.equal(p.x,1.2);assert.ok(Math.abs(p.y-1.44)<1e-12);
 p=inspect('x^2',1.19,7.99,settings);
 assert.equal(p.label,'Grid point');assert.equal(p.x,1.2);assert.equal(p.y,8);
});
