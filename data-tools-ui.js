(() => {
  const get=id=>document.getElementById(id);
  const tableDialog=document.createElement('dialog');
  tableDialog.id='table-dialog'; tableDialog.setAttribute('aria-labelledby','table-heading');
  tableDialog.innerHTML='<h2 id="table-heading">Insert table</h2><p class="data-help">Enter cells below, or paste rows separated by tabs or commas. Tables remain editable in saved lessons.</p><label>Title<input id="table-title" maxlength="100" placeholder="Optional table title" /></label><div class="data-controls"><label>Rows<input id="table-rows" type="number" min="1" max="20" value="4" /></label><label>Columns<input id="table-columns" type="number" min="1" max="12" value="3" /></label><label class="data-checkbox"><input id="table-header" type="checkbox" checked /> Header row</label></div><div class="data-grid-wrap"><table id="table-input-grid"></table></div><details class="data-paste"><summary>Paste table values</summary><textarea id="table-paste" rows="3" placeholder="Name&#9;Value&#10;A&#9;12&#10;B&#9;18"></textarea><button id="table-import" type="button">Use pasted values</button></details><p id="table-error" class="data-error" role="alert"></p><div class="modal-actions"><button id="table-close">Cancel</button><button id="table-insert" class="primary">Insert table</button></div>';
  const statsDialog=document.createElement('dialog');
  statsDialog.id='statistics-dialog'; statsDialog.setAttribute('aria-labelledby','statistics-heading');
  statsDialog.innerHTML='<h2 id="statistics-heading">Statistics</h2><p class="data-help">Use consecutive class boundaries, such as 0–10, 10–20, 20–30. Frequencies must be non-negative whole numbers. For classes 1–10, 11–20, use boundaries 0.5–10.5, 10.5–20.5.</p><div class="data-controls"><label>Title<input id="statistics-title" maxlength="100" value="Frequency distribution" /></label><label>Chart<select id="statistics-kind"><option value="histogram">Histogram</option><option value="polygon">Frequency polygon</option><option value="ogive">Cumulative frequency curve</option><option value="all">All three charts</option></select></label><label>Chart color<input id="statistics-color" type="color" value="#147a4b" /></label></div><div class="data-grid-wrap"><table id="statistics-input-grid"><thead><tr><th>Lower boundary</th><th>Upper boundary</th><th>Frequency</th><th></th></tr></thead><tbody></tbody></table></div><div class="data-controls"><button id="statistics-add-row">+ Class interval</button><label class="data-checkbox"><input id="statistics-add-table" type="checkbox" /> Include frequency table</label></div><details class="data-paste"><summary>Paste interval values</summary><textarea id="statistics-paste" rows="3" placeholder="0,10,4&#10;10,20,8&#10;20,30,6"></textarea><button id="statistics-import">Use pasted values</button></details><p id="statistics-summary" class="data-help" aria-live="polite"></p><p id="statistics-error" class="data-error" role="alert"></p><canvas id="statistics-preview" width="900" height="560" aria-label="Statistics chart preview"></canvas><div class="modal-actions"><button id="statistics-close">Cancel</button><button id="statistics-insert" class="primary">Insert chart</button></div>';
  document.body.append(tableDialog,statsDialog);
  const tableBackground=document.createElement('label');tableBackground.innerHTML='Background<select id="table-background"><option value="white">Solid white</option><option value="black">Solid black</option><option value="transparent">Transparent</option></select>';get('table-header').closest('.data-controls').append(tableBackground);
  const chartOptions=document.createElement('details'); chartOptions.className='data-paste'; chartOptions.open=true;
  chartOptions.innerHTML='<summary>Points & grid</summary><div class="data-controls"><label class="data-checkbox"><input id="statistics-show-points" type="checkbox" checked /> Show points</label><label class="data-checkbox"><input id="statistics-point-labels" type="checkbox" /> Point coordinates</label><label class="data-checkbox"><input id="statistics-show-grid" type="checkbox" checked /> Show grid</label></div><div class="data-controls"><label>X-axis interval<input id="statistics-step-x" type="number" min="0" step="any" placeholder="Auto" /></label><label>Y-axis interval<input id="statistics-step-y" type="number" min="0" step="any" placeholder="Auto" /></label><label>X subdivisions<input id="statistics-sub-x" type="number" min="1" max="20" value="1" /></label><label>Y subdivisions<input id="statistics-sub-y" type="number" min="1" max="20" value="1" /></label><label>Grid opacity <output id="statistics-opacity-value">35%</output><input id="statistics-opacity" type="range" min="0" max="100" value="35" /></label></div><p class="data-help">Blank intervals use Auto. Subdivisions: 1–20 (1 = major grid only). Point options apply to the polygon and cumulative frequency curve.</p>';
  get('statistics-preview').before(chartOptions);
  const appearance=document.createElement('div');appearance.className='data-controls';
  appearance.innerHTML='<label>Background<select id="statistics-background"><option value="transparent">Transparent</option><option value="white" selected>Solid white</option><option value="black">Solid black</option></select></label><label class="data-checkbox"><input id="statistics-smooth" type="checkbox" checked /> Smooth cumulative curve</label><label class="data-checkbox"><input id="statistics-quartiles" type="checkbox" checked /> Show Q1, Median, Q3 (x, y)</label><p class="data-help">Quartiles show intersections with the displayed curve at 25%, 50% and 75% of total frequency. These are estimates from grouped data.</p>';
  chartOptions.prepend(appearance);
  const teaching=document.createElement('div');teaching.className='data-controls';
  teaching.innerHTML='<label>Teach quartile<select id="statistics-quartile-target"><option value="all">All three</option><option value="Median">Median</option><option value="Q1">Q1</option><option value="Q3">Q3</option></select></label><label>Teaching step<select id="statistics-teaching-step"><option value="0">0 · Curve only</option><option value="1">1 · Find cumulative frequency level</option><option value="2">2 · Across to the curve</option><option value="3">3 · Down to the X-axis</option><option value="4" selected>4 · Reveal (x, y) values</option></select></label><p class="data-help">N = total frequency. Q1: N/4; Median: N/2; Q3: 3N/4. Start at that cumulative frequency on the Y-axis, go across to the curve, then down to the X-axis to read the value.</p>';
  appearance.after(teaching);
  const optionFields={'statistics-show-points':['showPoints',true],'statistics-point-labels':['showPointLabels',false],'statistics-show-grid':['showGrid',true], 'statistics-step-x':['gridStepX',undefined],'statistics-step-y':['gridStepY',undefined], 'statistics-sub-x':['gridSubdivisionsX',1],'statistics-sub-y':['gridSubdivisionsY',1],'statistics-opacity':['gridOpacity',.35]};
  Object.assign(optionFields,{'statistics-smooth':['smoothCurve',true],'statistics-quartiles':['showQuartiles',true],'statistics-background':['background','white']});
  Object.assign(optionFields,{'statistics-teaching-step':['teachingStep',4],'statistics-quartile-target':['quartileTarget','all']});
  function readOptions() {
    return Object.fromEntries(Object.entries(optionFields).map(([id,[key]])=>{
      const input=get(id); return [key,['background','quartileTarget'].includes(key)?input.value:input.type==='checkbox'?input.checked:input.value===''?undefined:Number(input.value)/(key==='gridOpacity'?100:1)];
    }));
  }
  Object.keys(optionFields).forEach(id=>get(id).oninput=()=>{get('statistics-opacity-value').textContent=get('statistics-opacity').value+'%';preview();});
  let editing=null;
  function cells() { return [...get('table-input-grid').rows].map(row=>[...row.querySelectorAll('input')].map(input=>input.value)); }
  function grid(values=[]) {
    const rows=Number(get('table-rows').value), cols=Number(get('table-columns').value);
    if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||rows>20||cols<1||cols>12) { get('table-error').textContent='Choose 1–20 rows and 1–12 columns.'; return; }
    get('table-error').textContent=''; get('table-input-grid').replaceChildren();
    for(let i=0;i<rows;i++) {
      const row=get('table-input-grid').insertRow();
      for(let j=0;j<cols;j++) { const input=document.createElement('input'); input.maxLength=500; input.value=values[i]?.[j]||''; input.setAttribute('aria-label',`Row ${i+1}, column ${j+1}`); row.insertCell().append(input); }
    }
  }
  function openTable(object=null) {
    commitText(); editing=object;
    get('table-background').value=object?.background??'white';
    get('table-title').value=object?.title||''; get('table-rows').value=object?.cells.length||4;
    get('table-columns').value=object?.cells[0].length||3; get('table-header').checked=object?.header??true;
    get('table-insert').textContent=object?'Update table':'Insert table'; grid(object?.cells); tableDialog.showModal();
  }
  get('table-rows').onchange=get('table-columns').onchange=()=>grid(cells());
  const pasted=text=>text.trim().split(/\r?\n/).filter(line=>line.trim()).map(line=>line.split(line.includes('\t')?'\t':',').map(value=>value.trim()));
  get('table-import').onclick=()=>{
    const values=pasted(get('table-paste').value);
    if(!values.length||values.length>20||Math.max(...values.map(r=>r.length))>12) { get('table-error').textContent='Paste 1–20 rows with at most 12 columns.'; return; }
    get('table-rows').value=values.length; get('table-columns').value=Math.max(...values.map(r=>r.length)); grid(values);
  };
  function insert(objects,dialog) {
    if(!objects.every(validObject)) throw Error('Check the table or chart values.');
    checkpoint();
    if(editing && page().objects.includes(editing)) Object.assign(editing,objects[0]);
    else page().objects.push(...objects);
    selected=editing||objects[0]; dialog.close();
    if(!editing&&objects.some(object=>object.type==='statistics'))setTool('move');
    syncSelection(); render(); thumbnails();
  }
  get('table-insert').onclick=()=>{
    try { const object={type:'table',x:400,y:160,w:1400,h:650,color:'#147a4b',width:2,rotation:0,...(editing||{}),background:get('table-background').value,title:get('table-title').value,cells:cells(),header:get('table-header').checked}; insert([object],tableDialog); }
    catch(error) { get('table-error').textContent=error.message; }
  };
  get('table-close').onclick=()=>tableDialog.close();
  function addRow(values={lower:'',upper:'',frequency:''}) {
    const body=get('statistics-input-grid').tBodies[0];
    if(body.rows.length>=50)return;
    const row=body.insertRow();
    for(const name of ['lower','upper','frequency']) {
      const input=document.createElement('input'); input.type='number'; input.step=name==='frequency'?'1':'any';
      if(name==='frequency')input.min=0; input.value=values[name]; input.dataset.field=name; input.setAttribute('aria-label',`${name} for class ${body.rows.length}`);
      input.oninput=preview; row.insertCell().append(input);
    }
    const remove=document.createElement('button'); remove.textContent='×'; remove.title='Remove class interval'; remove.onclick=()=>{ row.remove(); preview(); }; row.insertCell().append(remove);
  }
  function readRows() {
    return [...get('statistics-input-grid').tBodies[0].rows].map((row,i)=>Object.fromEntries([...row.querySelectorAll('input')].map(input=>{
      if(!input.value.trim())throw Error(`Row ${i+1}: complete every boundary and frequency.`);
      return [input.dataset.field,Number(input.value)];
    })));
  }
  function chart(kind=get('statistics-kind').value) {
    const rows=readRows(); TutorData.distribution(rows);
    return {type:'statistics',x:400,y:140,w:1400,h:780,width:2,rotation:0,...(editing||{}),title:get('statistics-title').value,
      color:get('statistics-color').value,kind:kind==='all'?'histogram':kind,rows,...readOptions()};
  }
  function preview() {
    try {
      const object=chart(), data=TutorData.distribution(object.rows), canvas=get('statistics-preview');
      canvas.getContext('2d').clearRect(0,0,900,560);
      TutorData.draw(canvas.getContext('2d'),{...object,x:0,y:0,w:900,h:560,rotation:0});
      get('statistics-error').textContent=''; get('statistics-summary').textContent=`${data.rows.length} classes · Total frequency ${data.total}${data.unequal?' · Histogram uses frequency density for unequal class widths.':''}`;
    } catch(error) { get('statistics-error').textContent=error.message; get('statistics-summary').textContent=''; get('statistics-preview').getContext('2d').clearRect(0,0,900,560); }
  }
  function openStats(object=null) {
    commitText(); editing=object; get('statistics-title').value=object?.title||'Frequency distribution';
    get('statistics-kind').value=object?.kind||'histogram'; get('statistics-color').value=object?.color||'#147a4b';
    Object.entries(optionFields).forEach(([id,[key,fallback]])=>{
      const input=get(id), value=object?.[key]??fallback;
      if(input.type==='checkbox')input.checked=value; else input.value=['background','quartileTarget'].includes(key)?value:value===undefined?'':value*(key==='gridOpacity'?100:1);
    });
    get('statistics-opacity-value').textContent=get('statistics-opacity').value+'%';
    get('statistics-add-table').checked=false; get('statistics-add-table').disabled=!!object;
    get('statistics-kind').querySelector('[value="all"]').disabled=!!object;
    get('statistics-insert').textContent=object?'Update chart':'Insert chart';
    get('statistics-input-grid').tBodies[0].replaceChildren();
    (object?.rows||[{lower:0,upper:10,frequency:4},{lower:10,upper:20,frequency:8},{lower:20,upper:30,frequency:6}]).forEach(addRow);
    preview(); statsDialog.showModal();
  }
  get('statistics-add-row').onclick=()=>{ const rows=get('statistics-input-grid').tBodies[0].rows; const last=rows.length?Number(rows[rows.length-1].querySelector('[data-field="upper"]').value):0; addRow({lower:last,upper:last+10,frequency:0}); preview(); };
  get('statistics-import').onclick=()=>{
    try {
      const values=pasted(get('statistics-paste').value);
      if(!values.length||values.length>50||values.some(row=>row.length!==3||row.some(v=>!v)))throw Error('Paste three numeric columns: lower boundary, upper boundary, frequency.');
      const rows=values.map(row=>({lower:Number(row[0]),upper:Number(row[1]),frequency:Number(row[2])})); TutorData.distribution(rows);
      get('statistics-input-grid').tBodies[0].replaceChildren(); rows.forEach(addRow); preview();
    } catch(error) { get('statistics-error').textContent=error.message; }
  };
  ['statistics-title','statistics-kind','statistics-color'].forEach(id=>get(id).oninput=preview);
  get('statistics-close').onclick=()=>statsDialog.close();
  get('statistics-insert').onclick=()=>{
    try {
      const kinds=get('statistics-kind').value==='all'?['histogram','polygon','ogive']:[get('statistics-kind').value];
      const objects=kinds.map((kind,i)=>({...chart(kind),...(kinds.length>1?{x:50+i*940,y:170,w:900,h:640}:{} )}));
      if(get('statistics-add-table').checked&&!editing) {
        const data=TutorData.distribution(objects[0].rows);
        if(kinds.length===1) Object.assign(objects[0],{x:60,y:120,w:1500,h:750});
        else objects.forEach(object=>Object.assign(object,{y:80,h:580}));
        objects.push({type:'table',title:'Frequency table',header:true,x:kinds.length===1?1650:420,y:kinds.length===1?120:700,w:kinds.length===1?1150:1400,h:kinds.length===1?750:340,color:'#147a4b',width:2,rotation:0,
          cells:[['Class interval','Frequency','Cumulative'],...data.rows.map(r=>[`${r.lower}–${r.upper}`,String(r.frequency),String(r.cumulative)])]});
        if(data.rows.length+1>20)throw Error('The optional frequency table supports at most 19 classes.');
      }
      insert(objects,statsDialog);
    } catch(error) { get('statistics-error').textContent=error.message; }
  };
  const tableButton=document.createElement('button'); tableButton.id='table-tools'; tableButton.textContent='+ Table'; tableButton.title='Insert an editable table';
  document.querySelector('.workspace-actions').append(tableButton); tableButton.onclick=()=>openTable();
  const statsButton=document.createElement('button'); statsButton.id='statistics-tools'; statsButton.className='insert';
  statsButton.innerHTML='<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 17v-5h3v5M12 17V8h3v9M17 17V5h3v12"/></svg><span>Statistics</span>';
  get('geometry-tools').after(statsButton); statsButton.onclick=()=>openStats();
  const edit=document.createElement('button'); edit.id='edit-data-selected'; edit.textContent='Edit values'; edit.hidden=true;
  get('object-heading').after(edit); edit.onclick=()=>selected?.type==='table'?openTable(selected):openStats(selected);
  const lessonControls=document.createElement('div');lessonControls.id='statistics-teaching-controls';lessonControls.hidden=true;
  lessonControls.innerHTML='<h3>TEACH FROM THE CURVE</h3><label>Find<select id="curve-target"><option value="Median">Median · N/2</option><option value="Q1">Q1 · N/4</option><option value="Q3">Q3 · 3N/4</option><option value="all">All three</option></select></label><label>Step<select id="curve-step"><option value="0">0 · Curve only</option><option value="1">1 · Cumulative frequency level</option><option value="2">2 · Across to curve</option><option value="3">3 · Down to X-axis</option><option value="4">4 · Reveal values</option></select></label><button id="curve-next">Next step →</button><p class="data-help">N = total frequency. Read across from the Y-axis to the curve, then down to the X-axis.</p><h3>READ ANY VALUE</h3><label>Known value<select id="curve-probe-axis"><option value="x">X → find Y</option><option value="y">Y → find X</option></select></label><input id="curve-probe-value" type="number" step="any" aria-label="Known curve value" /><div class="data-controls"><button id="curve-probe-read">Show guides</button><button id="curve-probe-clear">Clear</button></div><p id="curve-probe-result" class="data-help" aria-live="polite"></p><p class="data-help">For a flat cumulative section, Y → X shows the first matching X.</p>';
  edit.after(lessonControls);
  function changeCurve(values){if(selected?.type!=='statistics'||selected.kind!=='ogive')return;checkpoint();Object.assign(selected,values);syncSelection();render();thumbnails();}
  get('curve-target').onchange=()=>changeCurve({quartileTarget:get('curve-target').value,showQuartiles:true});
  get('curve-step').onchange=()=>changeCurve({teachingStep:Number(get('curve-step').value),showQuartiles:true});
  get('curve-next').onclick=()=>changeCurve({teachingStep:Math.min(4,(selected.teachingStep??4)+1),showQuartiles:true});
  get('curve-probe-read').onclick=()=>{try{const axis=get('curve-probe-axis').value,input=get('curve-probe-value').value;if(!input.trim())throw Error('Enter a known value first.');const value=Number(input);TutorData.probe(selected,axis,value);changeCurve({probe:{axis,value}});}catch(error){get('curve-probe-result').textContent=error.message;}};
  get('curve-probe-clear').onclick=()=>changeCurve({probe:undefined});
  const graphReader=document.createElement('div');graphReader.id='graph-value-reader';graphReader.innerHTML='<h3>READ ANY VALUE</h3><label>Curve<select id="graph-read-curve"></select></label><label>Known value<select id="graph-read-axis"><option value="x">X → find Y</option><option value="y">Y → find X</option></select></label><input id="graph-read-value" type="number" step="any" aria-label="Known graph value" /><div class="data-controls"><button id="graph-read-show">Show guides</button><button id="graph-read-clear">Clear</button></div><p id="graph-read-result" class="data-help" aria-live="polite"></p><p class="data-help">Y → X lists multiple visible intersections. Numerical search may miss very narrow or rapidly oscillating intersections.</p>';
  get('graph-grid-options').prepend(graphReader);
  function graphResult(){if(!selected?.readProbe)return '';try{const p=selected.readProbe,points=TutorMath.readValue(selected,p.axis,p.value,p.curve);return points.length?points.map(v=>v.interval?`All X from ${v.interval[0]} to ${v.interval[1]}: Y = ${v.y}`:`(${+v.x.toPrecision(6)}, ${+v.y.toPrecision(6)})`).join(' · '):'No visible intersection in this range.';}catch(error){return error.message;}}
  get('graph-read-show').onclick=()=>{if(selected?.type!=='graph')return;try{const input=get('graph-read-value').value;if(!input.trim())throw Error('Enter a known value first.');const readProbe={axis:get('graph-read-axis').value,value:Number(input),curve:Number(get('graph-read-curve').value)};TutorMath.readValue(selected,readProbe.axis,readProbe.value,readProbe.curve);checkpoint();selected.readProbe=readProbe;syncSelection();render();thumbnails();}catch(error){get('graph-read-result').textContent=error.message;}};
  get('graph-read-clear').onclick=()=>{if(selected?.type!=='graph')return;checkpoint();delete selected.readProbe;syncSelection();render();thumbnails();};
  const format=document.createElement('div');format.id='statistics-format-toolbar';format.hidden=true;format.setAttribute('role','region');format.setAttribute('aria-label','Selected statistics chart formatting');
  format.innerHTML='<label>Background<select id="stat-format-background"><option value="transparent">Transparent</option><option value="white">White</option><option value="black">Black</option></select></label><label>Color<input id="stat-format-color" type="color" /></label><label><input id="stat-format-points" type="checkbox" /> Points</label><label><input id="stat-format-labels" type="checkbox" /> Coordinates</label><label><input id="stat-format-grid" type="checkbox" /> Grid</label><label id="stat-format-smooth-label"><input id="stat-format-smooth" type="checkbox" /> Smooth</label><button id="stat-format-edit">Edit values</button><details><summary>Grid settings</summary><div class="stat-format-grid-fields"><label>X interval<input id="stat-format-step-x" type="number" step="any" placeholder="Auto" /></label><label>Y interval<input id="stat-format-step-y" type="number" step="any" placeholder="Auto" /></label><label>X subdivisions<input id="stat-format-sub-x" type="number" min="1" max="20" /></label><label>Y subdivisions<input id="stat-format-sub-y" type="number" min="1" max="20" /></label><label>Opacity <output id="stat-format-opacity-value"></output><input id="stat-format-opacity" type="range" min="0" max="100" /></label></div></details><span id="stat-format-error" role="alert"></span>';
  document.body.append(format);
  const closeFormat=document.createElement('button');closeFormat.id='stat-format-close';closeFormat.type='button';closeFormat.textContent='×';closeFormat.title='Close formatting toolbar';closeFormat.setAttribute('aria-label','Close statistics formatting toolbar');
  get('stat-format-edit').after(closeFormat);
  let dismissedChart=null;
  closeFormat.onclick=()=>{dismissedChart=selected;format.hidden=true;};
  canvas.addEventListener('pointerdown',()=>{dismissedChart=null;positionFormat();});
  const formatFields={'stat-format-background':['background','white'],'stat-format-color':['color','#147a4b'],'stat-format-points':['showPoints',true],'stat-format-labels':['showPointLabels',false],'stat-format-grid':['showGrid',true],'stat-format-smooth':['smoothCurve',true],'stat-format-step-x':['gridStepX',undefined],'stat-format-step-y':['gridStepY',undefined],'stat-format-sub-x':['gridSubdivisionsX',1],'stat-format-sub-y':['gridSubdivisionsY',1],'stat-format-opacity':['gridOpacity',.35]};
  Object.entries(formatFields).forEach(([id,[key]])=>get(id).onchange=()=>{
    if(selected?.type!=='statistics')return;const input=get(id);
    const value=input.type==='checkbox'?input.checked:['background','color'].includes(key)?input.value:input.value===''?undefined:Number(input.value)/(key==='gridOpacity'?100:1);
    try{TutorData.settings({...selected,[key]:value});if(selected[key]===value)return;checkpoint();selected[key]=value;get('stat-format-error').textContent='';syncSelection();render();thumbnails();}catch(error){get('stat-format-error').textContent=error.message;}
  });
  get('stat-format-edit').onclick=()=>openStats(selected);
  let formatFrame=0;
  function positionFormat(){if(formatFrame)return;formatFrame=requestAnimationFrame(()=>{formatFrame=0;
    const target=selected?.type==='statistics'&&selected!==dismissedChart&&page().objects.includes(selected)&&tool!=='eraser'&&!document.querySelector('dialog[open]')?selected:null;format.hidden=!target;if(!target)return;
    const surface=canvas.getBoundingClientRect(),stage=boardStage.getBoundingClientRect(),bounds=objectBounds(target);
    const anchor={left:surface.left+bounds.x*surface.width/W,top:surface.top+bounds.y*surface.height/H,right:surface.left+bounds.right*surface.width/W,bottom:surface.top+bounds.bottom*surface.height/H};
    if(anchor.bottom<stage.top||anchor.top>stage.bottom||anchor.right<stage.left||anchor.left>stage.right){format.hidden=true;return;}
    const box=format.getBoundingClientRect();format.style.left=Math.max(8,Math.min(anchor.left,innerWidth-box.width-8))+'px';
    let top=anchor.bottom+8;
    if(top+box.height>innerHeight-8)top=anchor.top-box.height-8;
    format.style.top=Math.max(stage.top+4,Math.min(top,innerHeight-box.height-8))+'px';
  });}
  boardStage.addEventListener('scroll',positionFormat);window.addEventListener('resize',positionFormat);canvas.addEventListener('pointermove',positionFormat);format.addEventListener('toggle',positionFormat,true);
  new ResizeObserver(positionFormat).observe(canvas);
  [tableDialog,statsDialog].forEach(dialog=>{dialog.addEventListener('close',positionFormat);new MutationObserver(positionFormat).observe(dialog,{attributes:true,attributeFilter:['open']});});
  window.TutorDataUI={sync(){
    if(selected!==dismissedChart)dismissedChart=null;
    if(selected?.type==='statistics'){Object.entries(formatFields).forEach(([id,[key,fallback]])=>{const input=get(id),value=selected[key]??fallback;if(input===document.activeElement)return;if(input.type==='checkbox')input.checked=value;else input.value=value===undefined?'':key==='gridOpacity'?Math.round(value*100):value;});get('stat-format-opacity-value').textContent=Math.round((selected.gridOpacity??.35)*100)+'%';get('stat-format-smooth-label').hidden=selected.kind!=='ogive';}
    positionFormat();
    if(selected?.type==='graph'){const select=get('graph-read-curve'),previous=selected.readProbe?.curve??Number(select.value||0);select.replaceChildren(...selected.curves.map((curve,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1}. y = ${curve.expression}`;return option;}));select.value=Math.min(previous,Math.max(0,selected.curves.length-1));get('graph-read-show').disabled=!selected.curves.length;get('graph-read-result').textContent=graphResult();}
    const curve=selected?.type==='statistics'&&selected.kind==='ogive'&&page().objects.includes(selected);
    lessonControls.hidden=!curve;
    if(curve){get('curve-target').value=selected.quartileTarget??'all';get('curve-step').value=selected.teachingStep??4;get('curve-next').disabled=(selected.teachingStep??4)>=4;get('curve-probe-result').textContent=selected.probe?(()=>{const p=TutorData.probe(selected,selected.probe.axis,selected.probe.value);return `X = ${Number(p.x.toPrecision(6))} · Cumulative frequency Y = ${Number(p.y.toPrecision(6))}`;})():'';}
    edit.hidden=!selected||!['table','statistics'].includes(selected.type)||!page().objects.includes(selected)||tool==='eraser';
    get('image-width').closest('label').firstChild.textContent=selected?.type==='table'?'Table width':selected?.type==='statistics'?'Chart width':'Image width';
    get('apply-image-size').textContent=selected?.type==='table'?'Resize table':selected?.type==='statistics'?'Resize chart':'Resize image';
  }};
  TutorDataUI.sync();
})();
