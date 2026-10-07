const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data-tools.js');
const rows=[{lower:0,upper:10,frequency:4},{lower:10,upper:20,frequency:8},{lower:20,upper:40,frequency:6}];
test('statistics major and subdivision grid lines use consistent thickness and opacity',()=>{
  const strokes=[],stack=[],c={globalAlpha:1,save(){stack.push({alpha:this.globalAlpha,width:this.lineWidth})},restore(){const s=stack.pop();this.globalAlpha=s.alpha;this.lineWidth=s.width;},stroke(){strokes.push({alpha:this.globalAlpha,width:this.lineWidth})}};
  for(const name of ['translate','rotate','scale','fillRect','strokeRect','fillText','beginPath','moveTo','lineTo','bezierCurveTo','arc','fill','setLineDash'])c[name]=()=>{};
  data.draw(c,{type:'statistics',kind:'ogive',rows,x:0,y:0,w:900,h:560,title:'Grid',color:'#147a4b',showQuartiles:false,gridSubdivisionsX:5,gridSubdivisionsY:5,gridOpacity:.35});
  const grid=strokes.filter(s=>s.alpha===.35);assert.ok(grid.length>20);assert.ok(grid.every(s=>s.width===.7));
});
test('curve reading maps X to Y and Y back to X, including flat sections and range limits',()=>{
  for(const smoothCurve of [true,false]){const o={kind:'ogive',rows,smoothCurve};for(const x of [0,5,10,16,25,40]){const p=data.probe(o,'x',x);assert.ok(Math.abs(data.probe(o,'y',p.y).x-x)<1e-7);}assert.throws(()=>data.probe(o,'x',41));assert.throws(()=>data.probe(o,'y',19));}
  const flat={kind:'ogive',rows:[{lower:0,upper:10,frequency:4},{lower:10,upper:20,frequency:0},{lower:20,upper:30,frequency:4}]};
  assert.equal(data.probe(flat,'y',4).x,10);assert.equal(data.probe(flat,'x',15).y,4);
});
test('smooth cumulative curves remain monotone and quartile markers intersect the displayed curve',()=>{
  const o={kind:'ogive',rows},points=data.chartPoints(o),slopes=data.curveSlopes(points);
  for(let i=0;i<points.length-1;i++){let previous=points[i][1];for(let k=0;k<=100;k++){const value=data.curveValue(points,slopes,i,k/100);assert.ok(value>=previous-1e-10);assert.ok(value<=points[i+1][1]+1e-10);previous=value;}}
  for(const q of data.quartiles(o)){const i=points.findIndex((p,j)=>j<points.length-1&&q.x>=p[0]&&q.x<=points[j+1][0]);assert.ok(Math.abs(data.curveValue(points,slopes,i,(q.x-points[i][0])/(points[i+1][0]-points[i][0]))-q.y)<1e-10);}
  assert.deepEqual(data.quartiles({...o,smoothCurve:false}).map(q=>q.y),[4.5,9,13.5]);
  assert.equal(data.quartiles({...o,smoothCurve:false})[1].x,16.25);
  const flat={kind:'ogive',rows:[{lower:0,upper:10,frequency:4},{lower:10,upper:20,frequency:0},{lower:20,upper:30,frequency:4}]};
  assert.equal(data.quartiles(flat)[1].x,10);
});
test('grouped data derives midpoints, unequal-width densities and cumulative totals',()=>{
  const result=data.distribution(rows);
  assert.equal(result.total,18); assert.equal(result.unequal,true);
  assert.deepEqual(result.rows.map(r=>r.midpoint),[5,15,30]);
  assert.deepEqual(result.rows.map(r=>r.density),[.4,.8,.3]);
  assert.deepEqual(result.rows.map(r=>r.cumulative),[4,12,18]);
  assert.deepEqual(data.chartPoints({kind:'ogive',rows}),[[0,0],[10,4],[20,12],[40,18]]);
  assert.deepEqual(data.chartPoints({kind:'polygon',rows}),[[-5,0],[5,4],[15,8],[30,6],[50,0]]);
});
test('statistics point and grid settings survive JSON and reject unsafe intervals',()=>{
  const graph={type:'statistics',kind:'ogive',rows,x:0,y:0,w:900,h:560,title:'Curve',showPoints:false,showPointLabels:true,showGrid:false,gridStepX:5,gridStepY:4,gridSubdivisionsX:5,gridSubdivisionsY:2,gridOpacity:.5};
  const saved=JSON.parse(JSON.stringify(graph));
  assert.equal(data.valid(saved),true);
  assert.equal(data.settings(saved).showPoints,false);
  assert.equal(data.settings(saved).ymax,20);
  for(const extra of [{gridStepX:0},{gridStepY:.00001},{gridOpacity:2},{gridSubdivisionsX:21},{showPoints:'yes'}])assert.equal(data.valid({...graph,...extra}),false);
});
test('invalid, overlapping, gapped and empty distributions are rejected',()=>{
  for(const bad of [[],[{lower:0,upper:0,frequency:1}],[{lower:0,upper:10,frequency:-1}],[{lower:0,upper:10,frequency:1.5}],[{lower:0,upper:10,frequency:0}],
    [{lower:0,upper:10,frequency:2},{lower:11,upper:20,frequency:4}], [{lower:0,upper:10,frequency:2},{lower:9,upper:20,frequency:4}]])
    assert.throws(()=>data.distribution(bad));
});
test('editable tables and statistics validate through lesson JSON',()=>{
  const base={x:10,y:10,w:900,h:560,title:'Example',rotation:15};
  const table={...base,type:'table',cells:[['Class','Count'],['0–10','4']],header:true};
  const graph={...base,type:'statistics',kind:'histogram',rows};
  assert.equal(data.valid(JSON.parse(JSON.stringify(table))),true);
  assert.equal(data.valid(JSON.parse(JSON.stringify(graph))),true);
  assert.equal(data.valid({...table,cells:[['A','B'],['C']]}),false);
  assert.equal(data.valid({...graph,kind:'script'}),false);
  assert.equal(data.valid({...table,cells:[['x'.repeat(501)]]}),false);
});
