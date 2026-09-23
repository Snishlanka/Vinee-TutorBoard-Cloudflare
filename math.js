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
  function ticks(lo, hi) {
    const raw = (hi - lo) / 10,
      base = 10 ** Math.floor(Math.log10(raw)),
      ratio = raw / base,
      step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * base;
    const values = [];
    for (
      let v = Math.ceil(lo / step) * step;
      v <= hi + step * 0.001 && values.length < 50;
      v += step
    )
      values.push(Math.abs(v) < step * 1e-8 ? 0 : +v.toPrecision(8));
    return values;
  }
  // Minor lines divide major axis tick intervals, including partial edge intervals.
  function minorTicks(lo, hi, divisions) {
    const major = ticks(lo, hi);
    if (divisions <= 1 || major.length < 2) return [];
    const step = major[1] - major[0], result = [];
    for (let base = major[0] - step; base < hi; base += step) {
      for (let i = 1; i < divisions; i++) {
        const value = base + step * i / divisions;
        if (value > lo && value < hi) result.push(value);
      }
    }
    return result;
  }
  function graph(c, o, bg) {
    const left = o.x + 58,
      top = o.y + 70,
      w = o.w - 84,
      h = o.h - 114;
    const X = (x) => left + ((x - o.xmin) / (o.xmax - o.xmin)) * w,
      Y = (y) => top + ((o.ymax - y) / (o.ymax - o.ymin)) * h,
      ink = bg === 'white' ? '#34425a' : '#e7edf8';
    c.save();
    c.fillStyle = bg === 'white' ? '#ffffffed' : '#ffffff09';
    c.fillRect(o.x, o.y, o.w, o.h);
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
    for (const x of minorTicks(o.xmin, o.xmax, o.gridSubdivisionsX ?? 1)) {
      c.moveTo(X(x), top); c.lineTo(X(x), top + h);
    }
    for (const y of minorTicks(o.ymin, o.ymax, o.gridSubdivisionsY ?? 1)) {
      c.moveTo(left, Y(y)); c.lineTo(left + w, Y(y));
    }
    c.stroke();
    c.restore();
    c.font = '17px "Segoe UI",Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const x of ticks(o.xmin, o.xmax)) {
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
    for (const y of ticks(o.ymin, o.ymax)) {
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
    c.restore();
    c.font = '18px "Segoe UI",Arial';
    c.textAlign = 'left';
    o.curves.forEach((curve, i) => {
      c.fillStyle = curve.color;
      c.fillText(
        'y = ' +
          (curve.expression.length > 36 ? curve.expression.slice(0, 33) + '…' : curve.expression),
        o.x + 12 + ((i % 2) * o.w) / 2,
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
  return { compile, ticks, minorTicks, graph, geometry, valid };
})();
