const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function inspect(expression,x,y=0){
 const g={x:0,y:0,w:900,h:650,xmin:-10,xmax:10,ymin:-10,ymax:10,curves:[{expression}]};
 const c=vm.createContext({graphLensState:{graph:g,sx:2,sy:2,center:{x:58+(x+10)/20*816,y:70+(10-y)/20*536}}});
 vm.runInContext(fs.readFileSync('math.js','utf8'),c);
 const source=fs.readFileSync('app.js','utf8');
 vm.runInContext(source.slice(source.indexOf('function lensPointAt('),source.indexOf('function paintGraphLens(')),c);
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
