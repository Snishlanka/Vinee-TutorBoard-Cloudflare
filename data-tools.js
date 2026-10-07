'use strict';
const TutorData = (() => {
  function distribution(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 50) throw Error('Enter 1–50 class intervals.');
    let cumulative = 0;
    const result = rows.map((row, i) => {
      if (!row || ![row.lower, row.upper, row.frequency].every(Number.isFinite) ||
          Math.abs(row.lower) > 1e9 || Math.abs(row.upper) > 1e9 || row.upper - row.lower < 1e-8 ||
          !Number.isInteger(row.frequency) || row.frequency < 0 || row.frequency > 1e9)
        throw Error(`Row ${i+1}: use increasing finite boundaries and a non-negative whole-number frequency.`);
      if (i && Math.abs(row.lower - rows[i-1].upper) > Math.max(1, Math.abs(row.lower)) * 1e-10)
        throw Error(`Row ${i+1}: class boundaries must be consecutive, with no gaps or overlaps.`);
      cumulative += row.frequency;
      return { ...row, midpoint: (row.lower+row.upper)/2, density: row.frequency/(row.upper-row.lower), cumulative };
    });
    if (!cumulative) throw Error('Total frequency must be greater than zero.');
    const firstWidth = rows[0].upper-rows[0].lower;
    return { rows: result, total: cumulative, unequal: rows.some(r => Math.abs(r.upper-r.lower-firstWidth) > firstWidth * 1e-8) };
  }
  function valid(o) {
    if(o.background!==undefined&&!['transparent','white','black'].includes(o.background))return false;
    if (![o.x,o.y,o.w,o.h].every(Number.isFinite) || o.w < 100 || o.h < 100 || o.w > 2880 || o.h > 1080 ||
        (o.rotation !== undefined && !Number.isFinite(o.rotation)) || typeof o.title !== 'string' || o.title.length > 100) return false;
    if (o.type === 'table') return Array.isArray(o.cells) && o.cells.length >= 1 && o.cells.length <= 20 &&
      Array.isArray(o.cells[0]) && o.cells[0].length >= 1 && o.cells[0].length <= 12 && typeof o.header === 'boolean' &&
      o.cells.every(row => Array.isArray(row) && row.length === o.cells[0].length && row.every(v => typeof v === 'string' && v.length <= 500));
    if (o.type !== 'statistics' || !['histogram','polygon','ogive'].includes(o.kind)) return false;
    try { distribution(o.rows); settings(o); return true; } catch { return false; }
  }
  function settings(o) {
    const data=distribution(o.rows), points=chartPoints(o);
    const xmin=o.kind==='polygon'?points[0][0]:data.rows[0].lower;
    const xmax=o.kind==='polygon'?points.at(-1)[0]:data.rows.at(-1).upper;
    const peak=o.kind==='histogram'?Math.max(...data.rows.map(r=>data.unequal?r.density:r.frequency)):Math.max(...points.map(p=>p[1]));
    const rough=peak/5, mag=10**Math.floor(Math.log10(rough)), n=rough/mag;
    const autoY=(n<=1?1:n<=2?2:n<=5?5:10)*mag;
    const result={teachingStep:o.teachingStep??4,quartileTarget:o.quartileTarget??'all',background:o.background??'white',smoothCurve:o.smoothCurve??true,showQuartiles:o.showQuartiles??true,showPoints:o.showPoints??true,showPointLabels:o.showPointLabels??false,showGrid:o.showGrid??true,
      gridOpacity:o.gridOpacity??.35,gridStepX:o.gridStepX??(xmax-xmin)/10,gridStepY:o.gridStepY??autoY,
      gridSubdivisionsX:o.gridSubdivisionsX??1,gridSubdivisionsY:o.gridSubdivisionsY??1};
    if(!['transparent','white','black'].includes(result.background))throw Error('Choose a chart background.');
    if(!Number.isInteger(result.teachingStep)||result.teachingStep<0||result.teachingStep>4||!['all','Q1','Median','Q3'].includes(result.quartileTarget))throw Error('Choose a valid teaching step.');
    if(o.probe!==undefined){if(!o.probe||!['x','y'].includes(o.probe.axis)||!Number.isFinite(o.probe.value)||o.probe.value<(o.probe.axis==='x'?xmin:0)||o.probe.value>(o.probe.axis==='x'?xmax:data.total))throw Error('Enter a value within the curve range.');}
    for(const key of ['smoothCurve','showQuartiles','showPoints','showPointLabels','showGrid']) if(typeof result[key]!=='boolean')throw Error('Choose valid point and grid options.');
    if(!Number.isFinite(result.gridOpacity)||result.gridOpacity<0||result.gridOpacity>1)throw Error('Grid opacity must be 0–100%.');
    for(const axis of ['X','Y']) {
      const step=result['gridStep'+axis], subdivisions=result['gridSubdivisions'+axis], span=axis==='X'?xmax-xmin:peak;
      if(!Number.isFinite(step)||step<=0||span/step>200)throw Error('Use positive axis intervals with at most 200 intervals per axis.');
      if(!Number.isInteger(subdivisions)||subdivisions<1||subdivisions>20)throw Error('Use 1–20 subdivisions per axis.');
    }
    return {...result,xmin,xmax,peak,ymax:Math.ceil(peak/result.gridStepY)*result.gridStepY};
  }
  const number = n => Number(n.toPrecision(5)).toString();
  function draw(c, o) {
    c.save();
    c.translate(o.x + o.w/2, o.y + o.h/2);
    c.rotate((o.rotation || 0)*Math.PI/180);
    c.translate(-o.w/2, -o.h/2);
    c.scale(o.w/900, o.h/560);
    const background=o.background??'white';
    if(background!=='transparent'){c.fillStyle=background==='black'?'#111111':'#ffffff';c.fillRect(0,0,900,560);}
    if(background!=='transparent'){c.strokeStyle='#b9c7c0';c.lineWidth=1;c.strokeRect(.5,.5,899,559);}
    c.fillStyle = o.foreground||(background==='black'?'#eef5f1':'#22332d'); c.font = 'bold 23px "Segoe UI",sans-serif';
    if (o.title) c.fillText(o.title,24,34,850);
    if (o.type === 'table') drawTable(c,o); else drawChart(c,o);
    c.restore();
  }
  function drawTable(c,o) {
    const dark=o.background==='black'||o.foreground==='#eef5f1',ink=dark?'#eef5f1':'#22332d';
    const top = o.title ? 52 : 12, rowHeight = (548-top)/o.cells.length, colWidth=876/o.cells[0].length;
    const font = Math.max(10, Math.min(22, rowHeight*.4, colWidth*.25));
    o.cells.forEach((row,i) => row.forEach((value,j) => {
      const x=12+j*colWidth, y=top+i*rowHeight;
      c.fillStyle = dark?(o.header&&i===0?'#284638':i%2?'#1a211e':'#111111'):(o.header && i===0 ? '#e5f3eb' : i%2 ? '#f7faf8' : '#ffffff');
      if(o.background!=='transparent')c.fillRect(x,y,colWidth,rowHeight);
      c.strokeStyle=dark?'#80988b':'#c4d2ca'; c.lineWidth=1; c.strokeRect(x,y,colWidth,rowHeight);
      c.save(); c.beginPath(); c.rect(x+4,y+2,colWidth-8,rowHeight-4); c.clip();
      c.fillStyle=ink; c.font=`${o.header && i===0 ? 'bold ' : ''}${font}px "Segoe UI",sans-serif`;
      c.textBaseline='middle';
      const lines=value.split('\n'), shown=lines.slice(0,Math.max(1,Math.floor(rowHeight/(font*1.25))));
      shown.forEach((line,k) => c.fillText(line,x+8,y+rowHeight/2+(k-(shown.length-1)/2)*font*1.25,colWidth-16));
      c.restore();
    }));
  }
  function chartPoints(o) {
    const data=distribution(o.rows), rows=data.rows;
    if (o.kind==='ogive') return [[rows[0].lower,0], ...rows.map(r=>[r.upper,r.cumulative])];
    if (o.kind==='polygon') return [[rows[0].midpoint-(rows[0].upper-rows[0].lower),0], ...rows.map(r=>[r.midpoint,r.frequency]),
      [rows.at(-1).midpoint+(rows.at(-1).upper-rows.at(-1).lower),0]];
    return rows.map(r=>[r.lower,data.unequal?r.density:r.frequency]);
  }
  function drawChart(c,o) {
    const data=distribution(o.rows), rows=data.rows, points=chartPoints(o);
    const xmin=o.kind==='polygon'?points[0][0]:rows[0].lower, xmax=o.kind==='polygon'?points.at(-1)[0]:rows.at(-1).upper;
    const peak=o.kind==='histogram'?Math.max(...rows.map(r=>data.unequal?r.density:r.frequency)):Math.max(...points.map(p=>p[1]));
    const options=settings(o), step=options.gridStepY, ymax=options.ymax;
    const foreground=o.foreground||(options.background==='black'?'#eef5f1':'#22332d');
    const x=v=>100+(v-xmin)/(xmax-xmin)*748, y=v=>480-v/ymax*390;
    c.font='16px "Segoe UI",sans-serif'; c.textAlign='right';
    for(let k=0;k<=Math.round(ymax/step);k++) {
      const v=k*step, py=y(v);
      c.fillStyle=foreground; c.fillText(number(v),88,py+5);
    }
    if(options.showGrid) {
      c.save(); c.strokeStyle=foreground; c.globalAlpha=options.gridOpacity;
      for(const axis of ['X','Y']) {
        const major=options['gridStep'+axis], sub=options['gridSubdivisions'+axis], interval=major/sub;
        const start=axis==='X'?xmin:0, end=axis==='X'?xmax:ymax;
        for(let i=0;i<=Math.ceil((end-start)/interval);i++) {
          const v=start+i*interval; if(v>end+interval*1e-8)break;
          c.lineWidth=.7; c.beginPath();
          if(axis==='X'){ c.moveTo(x(v),90); c.lineTo(x(v),480); }
          else { c.moveTo(100,y(v)); c.lineTo(848,y(v)); } c.stroke();
        }
      } c.restore();
    }
    const boundaryTicks=o.gridStepX===undefined?[rows[0].lower,...rows.map(r=>r.upper)]:Array.from({length:Math.floor((xmax-xmin)/options.gridStepX)+1},(_,i)=>xmin+i*options.gridStepX), stride=Math.max(1,Math.ceil(boundaryTicks.length/10));
    c.textAlign='center'; boundaryTicks.forEach((v,i)=>{
      if(i%stride && i!==boundaryTicks.length-1)return;
      c.fillText(number(v),x(v),505);
    });
    c.strokeStyle=foreground; c.lineWidth=2; c.beginPath(); c.moveTo(100,90); c.lineTo(100,480); c.lineTo(848,480); c.stroke();
    c.fillStyle=foreground; c.fillText('Class boundary / value',474,540);
    c.save(); c.translate(28,280); c.rotate(-Math.PI/2);
    c.fillText(o.kind==='ogive'?'Cumulative frequency':o.kind==='histogram'&&data.unequal?'Frequency density':'Frequency',0,0); c.restore();
    c.strokeStyle=o.color; c.lineWidth=3;
    if(o.kind==='histogram') rows.forEach(r=>{
      const height=data.unequal?r.density:r.frequency;
      c.globalAlpha=.22; c.fillStyle=o.color; c.fillRect(x(r.lower),y(height),x(r.upper)-x(r.lower),480-y(height));
      c.globalAlpha=1; c.strokeRect(x(r.lower),y(height),x(r.upper)-x(r.lower),480-y(height));
    });
    else {
      c.beginPath(); c.moveTo(x(points[0][0]),y(points[0][1]));
      if(o.kind==='ogive'&&options.smoothCurve) {
        const slopes=curveSlopes(points);
        for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],h=(b[0]-a[0])/3;c.bezierCurveTo(x(a[0]+h),y(a[1]+slopes[i]*h),x(b[0]-h),y(b[1]-slopes[i+1]*h),x(b[0]),y(b[1]));}
      } else points.slice(1).forEach(p=>c.lineTo(x(p[0]),y(p[1]))); c.stroke();
      if(options.showPoints) points.forEach(p=>{ c.beginPath(); c.arc(x(p[0]),y(p[1]),4,0,2*Math.PI); c.fillStyle=o.color; c.fill(); });
      if(options.showPointLabels) { c.save(); c.font='13px "Segoe UI",sans-serif'; c.textAlign='center'; points.forEach(p=>{ const label=`(${number(p[0])}, ${number(p[1])})`, px=Math.max(150,Math.min(795,x(p[0]))), py=y(p[1])-12; c.fillStyle=foreground; c.fillText(label,px,py); }); c.restore(); }
    }
    if(o.kind==='ogive'&&options.showQuartiles&&options.teachingStep>0) {
      c.save();c.font='bold 14px "Segoe UI",sans-serif';c.textAlign='left';
      const targets=quartiles(o).filter(q=>options.quartileTarget==='all'||q.name===options.quartileTarget);
      targets.forEach((q,i)=>{
        c.strokeStyle=foreground;c.fillStyle=foreground;c.globalAlpha=.65;c.setLineDash([5,5]);c.lineWidth=1;
        c.beginPath();
        if(options.teachingStep>=2){c.moveTo(100,y(q.y));c.lineTo(x(q.x),y(q.y));}
        if(options.teachingStep>=3){c.moveTo(x(q.x),y(q.y));c.lineTo(x(q.x),480);}
        c.stroke();c.setLineDash([]);c.globalAlpha=1;
        c.beginPath();c.arc(options.teachingStep>=2?x(q.x):100,y(q.y),6,0,Math.PI*2);c.fill();
        const fraction=q.name==='Q1'?'N/4':q.name==='Median'?'N/2':'3N/4';
        c.fillText(options.teachingStep===4?`${q.name} (${number(q.x)}, ${number(q.y)})`:`${q.name}: ${fraction} = ${number(q.y)}`,115+i*240,83);
        if(options.teachingStep===4){c.textAlign='center';c.fillText(number(q.x),x(q.x),523);c.textAlign='left';}
      });c.restore();
    }
    if(o.kind==='ogive'&&o.probe){const p=probe(o,o.probe.axis,o.probe.value);c.save();c.strokeStyle=foreground;c.fillStyle=foreground;c.lineWidth=2;c.setLineDash([7,4]);c.beginPath();c.moveTo(100,y(p.y));c.lineTo(x(p.x),y(p.y));c.lineTo(x(p.x),480);c.stroke();c.setLineDash([]);c.beginPath();c.arc(x(p.x),y(p.y),7,0,Math.PI*2);c.fill();c.font='bold 16px "Segoe UI",sans-serif';c.textAlign='left';c.fillText(`Read curve: (${number(p.x)}, ${number(p.y)})`,110,65);c.restore();}
    c.textAlign='right'; c.font='14px "Segoe UI",sans-serif'; c.fillStyle=foreground; c.fillText(`Total frequency: ${data.total}`,850,65);
  }
  function curveSlopes(points) {
    const d=points.slice(1).map((p,i)=>(p[1]-points[i][1])/(p[0]-points[i][0]));
    return points.map((p,i)=>{
      if(!i)return d[0];if(i===points.length-1)return d.at(-1);
      if(d[i-1]===0||d[i]===0)return 0;
      const a=p[0]-points[i-1][0],b=points[i+1][0]-p[0],w1=2*b+a,w2=b+2*a;
      return (w1+w2)/(w1/d[i-1]+w2/d[i]);
    });
  }
  function curveValue(points,slopes,i,t) {
    const a=points[i],b=points[i+1],h=b[0]-a[0];
    return (2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*h*slopes[i]+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*h*slopes[i+1];
  }
  function quartiles(o) {
    const points=chartPoints({...o,kind:'ogive'}),slopes=curveSlopes(points),total=points.at(-1)[1];
    return ['Q1','Median','Q3'].map((name,index)=>{
      const target=total*(index+1)/4,i=points.findIndex((p,j)=>j<points.length-1&&p[1]<=target&&points[j+1][1]>=target),a=points[i],b=points[i+1];
      let t=(target-a[1])/(b[1]-a[1]);
      if(target===a[1])t=0;
      else if(target===b[1])t=1;
      else if(o.smoothCurve??true){let lo=0,hi=1;for(let k=0;k<50;k++){const mid=(lo+hi)/2;if(curveValue(points,slopes,i,mid)<target)lo=mid;else hi=mid;}t=(lo+hi)/2;}
      return {name,x:a[0]+(b[0]-a[0])*t,y:target};
    });
  }
  function probe(o,axis,value) {
    const points=chartPoints({...o,kind:'ogive'}),slopes=curveSlopes(points),column=axis==='x'?0:1;
    if(!Number.isFinite(value)||value<points[0][column]||value>points.at(-1)[column])throw Error(axis==='x'?`Enter X from ${points[0][0]} to ${points.at(-1)[0]}.`:`Enter cumulative frequency Y from 0 to ${points.at(-1)[1]}.`);
    const i=points.findIndex((p,j)=>j<points.length-1&&p[column]<=value&&points[j+1][column]>=value),a=points[i],b=points[i+1];
    if(axis==='x'){const t=(value-a[0])/(b[0]-a[0]);return {x:value,y:(o.smoothCurve??true)?curveValue(points,slopes,i,t):a[1]+(b[1]-a[1])*t};}
    if(value===a[1])return {x:a[0],y:value};if(value===b[1])return {x:b[0],y:value};
    let t=(value-a[1])/(b[1]-a[1]);if(o.smoothCurve??true){let lo=0,hi=1;for(let k=0;k<50;k++){const mid=(lo+hi)/2;if(curveValue(points,slopes,i,mid)<value)lo=mid;else hi=mid;}t=(lo+hi)/2;}return {x:a[0]+(b[0]-a[0])*t,y:value};
  }
  return { distribution, chartPoints, settings, quartiles, probe, curveSlopes, curveValue, valid, draw };
})();
if (typeof module !== 'undefined') module.exports = TutorData;
