const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const c = vm.createContext({});
vm.runInContext(fs.readFileSync('math.js','utf8')+';globalThis.math = TutorMath;',c);
const m = c.math;
const graph = {type:'graph',x:0,y:0,w:900,h:650,xmin:-10,xmax:10,ymin:-10,ymax:10,curves:[],width:3};
test('subdivisions follow axis ticks, including partial and negative intervals',()=>{
 for (const [lo,hi] of [[-10,10],[-1.3,2.7],[0,1],[100,120]]) {
  const major=m.ticks(lo,hi), step=major[1]-major[0];
  for(const n of [5,10]) {
   const minor=m.minorTicks(lo,hi,n);
   assert.equal(minor.filter(v=>v>major[0]+1e-8&&v<major[1]-1e-8).length,n-1);
   assert.ok(minor.every(v=>v>lo&&v<hi));
   assert.ok(minor.every(v=>Math.abs((v-major[0])/step*n-Math.round((v-major[0])/step*n))<1e-6));
  }
 }
 assert.equal(m.minorTicks(-10,10,1).length,0);
});
test('grid settings validate and legacy graphs remain valid',()=>{
 assert.ok(m.valid(graph));
 assert.ok(m.valid({...graph,gridSubdivisionsX:5,gridSubdivisionsY:10,gridOpacity:0}));
 for(const value of [0,21,1.5,NaN,'5']) assert.equal(m.valid({...graph,gridSubdivisionsX:value}),false);
 for(const value of [-1,1.01,NaN,'0.5']) assert.equal(m.valid({...graph,gridOpacity:value}),false);
});
test('grid opacity is isolated from axis lines and labels',()=>{
 const strokes=[],labels=[],stack=[];
 const ctx={globalAlpha:1,save(){stack.push(this.globalAlpha)},restore(){this.globalAlpha=stack.pop()},
 stroke(){strokes.push(this.globalAlpha)},fillText(){labels.push(this.globalAlpha)}};
 for(const name of ['fillRect','strokeRect','beginPath','moveTo','lineTo','rect','clip']) ctx[name]=()=>{};
 m.graph(ctx,{...graph,gridSubdivisionsX:5,gridSubdivisionsY:10,gridOpacity:0},'white');
 assert.ok(strokes.includes(0));
 assert.equal(strokes.at(-1),1);
 assert.ok(labels.every(a=>a===1));
 assert.equal(ctx.globalAlpha,1);
});

test('custom intervals use independent zero-aligned axis ticks and subdivisions',()=>{
 assert.deepEqual(Array.from(m.ticks(-2,2,1)),[-2,-1,0,1,2]);
 assert.deepEqual(Array.from(m.ticks(-1,1,.5)),[-1,-.5,0,.5,1]);
 assert.deepEqual(Array.from(m.ticks(-10,10,5)),[-10,-5,0,5,10]);
 assert.equal(m.minorTicks(0,1,5,1).length,4);
 assert.equal(m.minorTicks(.1,.4,10,1).length,2);
 assert.ok(m.valid({...graph,xTickStep:1,yTickStep:.5}));
 assert.ok(m.valid({...graph,xTickStep:null}));
 for(const xTickStep of [0,-1,.0001,NaN,'1']) assert.equal(m.valid({...graph,xTickStep}),false);
});
