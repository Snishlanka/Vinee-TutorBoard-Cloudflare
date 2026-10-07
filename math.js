'use strict';
// Small expression parser: no eval, Function constructor, or executable input.
const TutorMath = (() => {
  const functions = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    sqrt: Math.sqrt,
    abs: Math.abs,
    ln: Math.log,
    log: Math.log10,
    exp: Math.exp,
  };
  const cache = new Map();
  function compile(source) {
    source = source
      .trim()
      .replace(/^y\s*=\s*/i, '')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi');
    if (!source || source.length > 300) throw Error('Enter a function such as x^2 or 2*x+1.');
    if (cache.has(source)) return cache.get(source);
    const tokens = [];
    const re = /\s*(?:((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|([a-zA-Z]+)|([+\-*/^()]))/gy;
    let at = 0;
    while (at < source.length) {
      re.lastIndex = at;
      const m = re.exec(source);
      if (!m) throw Error('Use numbers, x, + − * / ^, brackets, or supported functions.');
      tokens.push(
        m[1]
          ? { kind: 'number', value: Number(m[1]) }
          : { kind: m[2] ? 'name' : m[3], value: m[2]?.toLowerCase() }
      );
      at = re.lastIndex;
    }
    let pos = 0;
    const peek = () => tokens[pos]?.kind;
    const take = (k) => {
      if (peek() !== k) throw Error('Check your brackets and operators.');
      return tokens[pos++];
    };
    function atom() {
      if (peek() === 'number') {
        const n = take('number').value;
        return () => n;
      }
      if (peek() === '(') {
        take('(');
        const f = sum();
        take(')');
        return f;
      }
      if (peek() === 'name') {
        const name = take('name').value;
        if (name === 'x') return (x) => x;
        if (name === 'pi') return () => Math.PI;
        if (name === 'e') return () => Math.E;
        if (!Object.hasOwn(functions, name)) throw Error('Unknown name: ' + name);
        take('(');
        const a = sum();
        take(')');
        return (x) => functions[name](a(x));
      }
      throw Error('Expected a number, x, or function.');
    }
    function power() {
      const a = atom();
      if (peek() === '^') {
        take('^');
        const b = unary();
        return (x) => a(x) ** b(x);
      }
      return a;
    }
    function unary() {
      if (peek() === '+') {
        take('+');
        return unary();
      }
      if (peek() === '-') {
        take('-');
        const a = unary();
        return (x) => -a(x);
      }
      return power();
    }
    function product() {
      let a = unary();
      while (['*', '/', 'number', 'name', '('].includes(peek())) {
        const k = peek(),
          old = a;
        if (k === '*' || k === '/') take(k);
        const b = unary();
        a = k === '/' ? (x) => old(x) / b(x) : (x) => old(x) * b(x);
      }
      return a;
    }
    function sum() {
      let a = product();
      while (peek() === '+' || peek() === '-') {
        const k = peek(),
          old = a;
        take(k);
        const b = product();
        a = k === '+' ? (x) => old(x) + b(x) : (x) => old(x) - b(x);
      }
      return a;
    }
    const result = sum();
    if (pos !== tokens.length) throw Error('Unexpected bracket or operator.');
    if (cache.size > 100) cache.clear();
    cache.set(source, result);
    return result;
  }
  function axisStep(lo, hi, interval) {
    if (Number.isFinite(interval) && interval > 0) return interval;
    const raw = (hi - lo) / 10, base = 10 ** Math.floor(Math.log10(raw)), ratio = raw / base;
    return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * base;
  }
  function ticks(lo, hi, interval) {
    const step = axisStep(lo, hi, interval), values = [];
    const first = Math.ceil(lo / step - 1e-10), last = Math.floor(hi / step + 1e-10);
    for (let i = first; i <= last && values.length <= 200; i++)
      values.push(i === 0 ? 0 : +(i * step).toPrecision(12));
    return values;
  }
  // Divide axis intervals even when the visible range contains no major tick.
  function minorTicks(lo, hi, divisions, interval) {
    if (divisions <= 1) return [];
    const step = axisStep(lo, hi, interval), result = [];
    const first = Math.floor(lo / step), last = Math.ceil(hi / step);
    for (let k = first; k < last && k - first <= 201; k++) {
      for (let i = 1; i < divisions; i++) {
        const value = (k + i / divisions) * step;
        if (value > lo && value < hi) result.push(value);
      }
    }
    return result;
  }
  // Equal physical length per axis unit; aspect is display Y-scale / X-scale.
  function graphFeatures(o) {
    const points = [], span = o.xmax-o.xmin;
    const clean = v => Math.abs(v)<1e-12 ? 0 : Math.abs(v)>1e-6 && Math.abs(v-Math.round(v))<1e-8 ? Math.round(v) : +v.toPrecision(10);
    const add = (x,y,label) => {
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<o.xmin||x>o.xmax||y<o.ymin||y>o.ymax) return;
      x=clean(x);y=clean(y);
      if(!points.some(p=>p.label===label&&Math.abs(p.x-x)<span*1e-7))points.push({x,y,label});
    };
    const bisect=(f,a,b)=>{
      let fa=f(a);
      for(let j=0;j<55;j++){
        const mid=(a+b)/2,fm=f(mid);
        if(!Number.isFinite(fm))return NaN;
        if(fm===0)return mid;
        if(Math.sign(fm)===Math.sign(fa)){a=mid;fa=fm;}else b=mid;
      }
      return (a+b)/2;
    };
    for(const curve of o.curves){
      let f;try{f=compile(curve.expression);}catch{continue;}
      if(o.xmin<=0&&o.xmax>=0)add(0,f(0),'Y-intercept');
      const h=span*1e-5;
      const derivative=x=>(f(x+h)-f(x-h))/(2*h);
      for(let i=0;i<256;i++){
        const a=o.xmin+i/256*span,b=o.xmin+(i+1)/256*span,fa=f(a),fb=f(b);
        if(fa===0)add(a,0,'X-intercept');
        if(fb===0)add(b,0,'X-intercept');
        if(Number.isFinite(fa)&&Number.isFinite(fb)&&fa*fb<0){
          const root=bisect(f,a,b);
          if(Math.abs(f(root))<1e-7)add(root,0,'X-intercept');
        }
        const da=derivative(a),db=derivative(b);
        if(!Number.isFinite(da)||!Number.isFinite(db)||!((da<=0&&db>=0)||(da>=0&&db<=0))||(da===0&&db===0))continue;
        const x=da===0?a:db===0?b:bisect(derivative,a,b),y=f(x);
        if(x<=o.xmin||x>=o.xmax||!Number.isFinite(y))continue;
        const before=derivative(x-h*2),after=derivative(x+h*2);
        if(before<0&&after>0)add(x,y,'Minimum');
        if(before>0&&after<0)add(x,y,'Maximum');
        if(Math.abs(y)<1e-9)add(x,0,'X-intercept');
      }
    }
    return points;
  }
  function plotBounds(o, aspect = 1) {
    const availableW = o.w - 84, availableH = o.h - 114;
    const dx = o.xmax - o.xmin, dy = o.ymax - o.ymin;
    const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const w = Math.min(availableW, availableH * ratio * dx / dy);
    const h = w * dy / dx / ratio;
    return { left: o.x + 58, top: o.y + 70, w, h };
  }
  function readValue(o,axis,value,index=0) {
    if(!['x','y'].includes(axis)||!Number.isFinite(value)||!Number.isInteger(index)||!o.curves[index])throw Error('Choose a curve and enter a finite value.');
    if(value<(axis==='x'?o.xmin:o.ymin)||value>(axis==='x'?o.xmax:o.ymax))throw Error('Enter a value inside the displayed axis range.');
    const f=compile(o.curves[index].expression),result=[],tol=1e-8*Math.max(1,Math.abs(value));
    const add=x=>{const y=f(x);if(Number.isFinite(y)&&y>=o.ymin&&y<=o.ymax&&Math.abs(y-value)<=tol&&!result.some(p=>Math.abs(p.x-x)<(o.xmax-o.xmin)*1e-7))result.push({x,y});};
    if(axis==='x'){const y=f(value);if(!Number.isFinite(y)||y<o.ymin||y>o.ymax)throw Error('The curve has no visible finite Y at this X.');return [{x:value,y}];}
    const count=4096,span=o.xmax-o.xmin;
    let constant=true;
    for(let i=0;i<=count;i++){const x=o.xmin+i/count*span,v=f(x)-value;if(!Number.isFinite(v)||Math.abs(v)>tol)constant=false;if(Math.abs(v)<=tol)add(x);if(i===count)continue;let a=x,b=x+span/count,fa=v,fb=f(b)-value;if(!Number.isFinite(fa)||!Number.isFinite(fb)||fa*fb>=0)continue;for(let k=0;k<55;k++){const m=(a+b)/2,fm=f(m)-value;if(!Number.isFinite(fm))break;if(Math.sign(fm)===Math.sign(fa)){a=m;fa=fm;}else b=m;}add((a+b)/2);}
    // Include tangent intersections that do not change sign.
    graphFeatures(o).filter(p=>p.label==='Minimum'||p.label==='Maximum').forEach(p=>add(p.x));
    if(constant)return [{x:o.xmin,y:value,interval:[o.xmin,o.xmax]}];
    return result.sort((a,b)=>a.x-b.x).slice(0,100);
  }
  function graph(c, o, bg, aspect = 1) {
    const {left, top, w, h} = plotBounds(o, aspect);
    const X = (x) => left + ((x - o.xmin) / (o.xmax - o.xmin)) * w,
      Y = (y) => top + ((o.ymax - y) / (o.ymax - o.ymin)) * h,
      ink = bg === 'white' ? '#34425a' : '#e7edf8';
    c.save();
    c.fillStyle = bg === 'white' ? '#ffffffed' : '#ffffff09';
    c.fillRect(o.x, o.y, w + 84, h + 114);
    c.strokeStyle = bg === 'white' ? '#dce2ec' : '#ffffff40';
    c.lineWidth = 1;
    c.strokeRect(left, top, w, h);
    const gridOpacity = o.gridOpacity ?? 0.35;
    const gridInk = bg === 'white' ? '#64748b' : '#ffffff';
    c.save();
    c.globalAlpha *= gridOpacity * 0.45;
    c.strokeStyle = gridInk;
    c.lineWidth = 0.7;
    c.beginPath();
    for (const x of minorTicks(o.xmin, o.xmax, o.gridSubdivisionsX ?? 1, o.xTickStep)) {
      c.moveTo(X(x), top); c.lineTo(X(x), top + h);
    }
    for (const y of minorTicks(o.ymin, o.ymax, o.gridSubdivisionsY ?? 1, o.yTickStep)) {
      c.moveTo(left, Y(y)); c.lineTo(left + w, Y(y));
    }
    c.stroke();
    c.restore();
    c.font = '17px "Segoe UI",Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const x of ticks(o.xmin, o.xmax, o.xTickStep)) {
      c.save();
      c.globalAlpha *= gridOpacity;
      c.strokeStyle = gridInk;
      c.beginPath();
      c.moveTo(X(x), top);
      c.lineTo(X(x), top + h);
      c.stroke();
      c.restore();
      c.fillStyle = ink;
      c.fillText(String(x), X(x), top + h + 20);
    }
    for (const y of ticks(o.ymin, o.ymax, o.yTickStep)) {
      c.save();
      c.globalAlpha *= gridOpacity;
      c.strokeStyle = gridInk;
      c.beginPath();
      c.moveTo(left, Y(y));
      c.lineTo(left + w, Y(y));
      c.stroke();
      c.restore();
      c.fillStyle = ink;
      c.textAlign = 'right';
      c.fillText(String(y), left - 9, Y(y));
    }
    c.strokeStyle = ink;
    c.lineWidth = 2;
    if (o.xmin <= 0 && o.xmax >= 0) {
      c.beginPath();
      c.moveTo(X(0), top);
      c.lineTo(X(0), top + h);
      c.stroke();
    }
    if (o.ymin <= 0 && o.ymax >= 0) {
      c.beginPath();
      c.moveTo(left, Y(0));
      c.lineTo(left + w, Y(0));
      c.stroke();
    }
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.fillText('x', left + w + 17, top + h);
    c.fillText('y', left, top - 16);
    c.save();
    c.beginPath();
    c.rect(left, top, w, h);
    c.clip();
    for (const curve of o.curves) {
      let f;
      try {
        f = compile(curve.expression);
      } catch {
        continue;
      }
      c.strokeStyle = curve.color;
      c.lineWidth = o.width;
      let prev = null;
      c.beginPath();
      for (let i = 0; i <= 1100; i++) {
        const x = o.xmin + (i / 1100) * (o.xmax - o.xmin),
          y = f(x),
          p = { x: X(x), y: Y(y) };
        if (!Number.isFinite(y) || Math.abs(p.y - top) > h * 8) {
          prev = null;
          continue;
        }
        let connect = prev && Math.abs(p.y - prev.y) < h / 2;
        if (connect) {
          const mid = f((prev.domain + x) / 2);
          if (!Number.isFinite(mid) || Math.abs(Y(mid) - (p.y + prev.y) / 2) > h / 5)
            connect = false;
        }
        if (connect) c.lineTo(p.x, p.y);
        else c.moveTo(p.x, p.y);
        prev = { ...p, domain: x };
      }
      c.stroke();
    }
    if(o.readProbe){try{const points=readValue(o,o.readProbe.axis,o.readProbe.value,o.readProbe.curve);c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=1.5;c.setLineDash([6,4]);for(const p of points){c.beginPath();c.moveTo(left,Y(p.y));c.lineTo(X(p.x),Y(p.y));c.lineTo(X(p.x),top+h);c.stroke();c.beginPath();c.arc(X(p.x),Y(p.y),5,0,Math.PI*2);c.fill();}c.setLineDash([]);}catch{}}
    c.restore();
    if(o.readProbe){try{
      const points=readValue(o,o.readProbe.axis,o.readProbe.value,o.readProbe.curve),placed=[];
      c.save();c.font='bold 17px "Segoe UI",Arial';c.textAlign='center';c.textBaseline='middle';
      for(const p of points){
        const label=`(${+p.x.toPrecision(6)}, ${+p.y.toPrecision(6)})`,width=c.measureText(label).width+16,height=28;
        const px=Math.max(left+width/2+3,Math.min(left+w-width/2-3,X(p.x)));
        let py=Math.max(top+height/2+3,Y(p.y)-23);
        for(let i=0;i<8&&placed.some(r=>Math.abs(r.x-px)<(r.width+width)/2+4&&Math.abs(r.y-py)<height+3);i++)py-=height+4;
        py=Math.max(top+height/2+3,py);placed.push({x:px,y:py,width});
        c.fillStyle=bg==='white'?'#fffffff2':'#142c48f2';c.fillRect(px-width/2,py-height/2,width,height);
        c.strokeStyle=bg==='white'?'#bcc9d9':'#a7c0df';c.lineWidth=1;c.strokeRect(px-width/2,py-height/2,width,height);
        c.fillStyle=ink;c.fillText(label,px,py);
      }
      if(!points.length){c.font='14px "Segoe UI",Arial';c.textAlign='left';c.fillStyle=ink;c.fillText('No visible intersection',left,top+h+48);}
      c.restore();
    }catch{}}
    c.font = '18px "Segoe UI",Arial';
    c.textAlign = 'left';
    o.curves.forEach((curve, i) => {
      c.fillStyle = curve.color;
      c.fillText(
        'y = ' +
          (curve.expression.length > 36 ? curve.expression.slice(0, 33) + '…' : curve.expression),
        o.x + 12 + ((i % 2) * (w + 84)) / 2,
        o.y + 20 + Math.floor(i / 2) * 25
      );
    });
    c.restore();
  }
  function vertices(kind, n) {
    if (kind === 'right')
      return [
        [0.1, 0.88],
        [0.1, 0.12],
        [0.9, 0.88],
      ];
    if (kind === 'triangle')
      return [
        [0.5, 0.1362693304],
        [0.92, 0.8637306696],
        [0.08, 0.8637306696],
      ];
    if (kind === 'isosceles')
      return [
        [0.5, 0.08],
        [0.8, 0.88],
        [0.2, 0.88],
      ];
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a)];
    });
  }
  function geometry(c, o) {
    c.save();
    const cx0 = o.x + o.w / 2,
      cy0 = o.y + o.h / 2;
    if (o.rotation) {
      c.translate(cx0, cy0);
      c.rotate((o.rotation * Math.PI) / 180);
      c.translate(-cx0, -cy0);
    }
    const pointName = (i) => o.pointNames?.[i] || String.fromCharCode(65 + i);
    c.strokeStyle = o.color;
    c.fillStyle = o.color;
    c.lineWidth = o.width;
    c.font = '23px "Segoe UI",Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (o.kind === 'angle') {
      const cx = o.x + o.w * 0.42,
        cy = o.y + o.h * 0.7,
        r = Math.min(o.w * 0.47, o.h * 0.55),
        a = (o.angle * Math.PI) / 180;
      c.beginPath();
      c.moveTo(cx + r, cy);
      c.lineTo(cx, cy);
      c.lineTo(cx + r * Math.cos(a), cy - r * Math.sin(a));
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, r * 0.28, -a, 0);
      c.stroke();
      c.fillText(o.angle + '°', cx + r * 0.43 * Math.cos(a / 2), cy - r * 0.43 * Math.sin(a / 2));
      if (o.labels) c.fillText(o.pointNames?.[0] || 'O', cx - 18, cy + 20);
    } else if (o.kind === 'circle') {
      const r = Math.min(o.w, o.h) * 0.37,
        cx = o.x + o.w / 2,
        cy = o.y + o.h / 2;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + r, cy);
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, 3, 0, Math.PI * 2);
      c.fill();
      if (o.labels) {
        c.fillText(o.pointNames?.[0] || 'O', cx - 12, cy + 20);
        c.fillText('r', cx + r / 2, cy - 16);
      }
    } else {
      const vs = vertices(o.kind, o.sides).map(([x, y]) => ({
        x: o.x + x * o.w,
        y: o.y + y * o.h,
      }));
      c.beginPath();
      vs.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.stroke();
      if (o.kind === 'right') {
        const p = vs[0];
        c.beginPath();
        c.moveTo(p.x, p.y - 22);
        c.lineTo(p.x + 22, p.y - 22);
        c.lineTo(p.x + 22, p.y);
        c.stroke();
      }
      if (o.labels)
        vs.forEach((p, i) => {
          const dx = p.x - (o.x + o.w / 2),
            dy = p.y - (o.y + o.h / 2),
            len = Math.hypot(dx, dy) || 1;
          c.fillText(pointName(i), p.x + (22 * dx) / len, p.y + (22 * dy) / len);
        });
    }
    c.restore();
  }
  function valid(o) {
    if (
      !Number.isFinite(o.x) ||
      !Number.isFinite(o.y) ||
      !Number.isFinite(o.w) ||
      !Number.isFinite(o.h) ||
      o.w < 100 ||
      o.h < 100 ||
      o.w > 2880 ||
      o.h > 1080
    )
      return false;
    if (
      o.type === 'geometry' &&
      ((o.rotation !== undefined && !Number.isFinite(o.rotation)) ||
        (o.pointNames !== undefined &&
          (!Array.isArray(o.pointNames) ||
            o.pointNames.length > 12 ||
            !o.pointNames.every((n) => typeof n === 'string' && n.length <= 12))))
    )
      return false;
    if (o.type === 'geometry')
      return (
        ['triangle', 'right', 'isosceles', 'polygon', 'angle', 'circle'].includes(o.kind) &&
        Number.isInteger(o.sides) &&
        o.sides >= 3 &&
        o.sides <= 12 &&
        Number.isFinite(o.angle) &&
        o.angle > 0 &&
        o.angle < 180 &&
        typeof o.labels === 'boolean'
      );
    if (o.type === 'graph') {
      if(o.readProbe&&(!['x','y'].includes(o.readProbe.axis)||!Number.isFinite(o.readProbe.value)||!Number.isInteger(o.readProbe.curve)||o.readProbe.curve<0||o.readProbe.curve>=o.curves?.length))return false;
      for (const [key, lo, hi] of [['xTickStep', o.xmin, o.xmax], ['yTickStep', o.ymin, o.ymax]]) {
        const step = o[key];
        if (step != null && (!Number.isFinite(step) || step <= 0 || (hi - lo) / step > 200)) return false;
      }
      if (['gridSubdivisionsX', 'gridSubdivisionsY'].some(key => o[key] !== undefined && (!Number.isInteger(o[key]) || o[key] < 1 || o[key] > 20)) ||
          (o.gridOpacity !== undefined && (!Number.isFinite(o.gridOpacity) || o.gridOpacity < 0 || o.gridOpacity > 1))) return false;
      if (
        ![o.xmin, o.xmax, o.ymin, o.ymax].every(Number.isFinite) ||
        o.xmax - o.xmin < 0.01 ||
        o.ymax - o.ymin < 0.01 ||
        [o.xmin, o.xmax, o.ymin, o.ymax].some((v) => Math.abs(v) > 1e6) ||
        !Array.isArray(o.curves) ||
        o.curves.length > 4
      )
        return false;
      try {
        return o.curves.every(
          (v) =>
            typeof v.color === 'string' &&
            typeof v.expression === 'string' &&
            !!compile(v.expression)
        );
      } catch {
        return false;
      }
    }
    return false;
  }
  return { compile, axisStep, ticks, minorTicks, graphFeatures, readValue, plotBounds, graph, geometry, valid };
})();
