'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), C = require('../source/core.js');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} differs from ${b}`);
const H = target => ({type:'H',target}), X = target => ({type:'X',target}), CX = (control,target) => ({type:'CX',control,target});
function graphOf(n, gates, id = 'sandbox') {
  const graph = C.starter(id,n), previous = Array.from({length:n},(_,q)=>({node:'in'+q,port:0}));
  gates.forEach((g,i)=>{
    const qs = ['CX','SWAP'].includes(g.type) ? [g.control,g.target] : [g.target], name='g'+i;
    graph.nodes.push({id:name,type:g.type,x:200+i*130,y:120+Math.min(...qs)*120});
    qs.forEach((q,port)=>{graph.edges.push(C.edge(previous[q].node,previous[q].port,name,port));previous[q]={node:name,port};});
  });
  previous.forEach((p,q)=>graph.edges.push(C.edge(p.node,p.port,'out'+q,0)));return graph;
}
function saved(kind, pool=[]) { const l=C.levels.find(l=>l.kind===kind),graph=C.solution(l.id,pool);return {id:kind,name:kind,kind,qubits:l.qubits,graph,gates:C.compile(graph,pool,l.qubits).gates}; }

test('six-qubit GHZ has exactly two positive amplitudes and correct local entanglement',()=>{
  const state=C.evolve([H(0),...Array.from({length:5},(_,q)=>CX(q,q+1))],6).state;
  near(state[0][0],Math.SQRT1_2);near(state[63][0],Math.SQRT1_2);assert.equal(C.probabilities(state).filter(p=>p>1e-8).length,2);
  C.marginals(state).forEach(q=>{near(q.p1,.5);near(q.purity,.5);near(q.entropy,1);});
  C.marginals(C.evolve([H(0),H(1)],6).state).forEach(q=>{near(q.purity,1);near(q.entropy,0);});
  assert.equal(C.bitOrder(6),'F E D C B A');assert.equal(C.starter('sandbox',6).nodes.at(-2).label,'INPUT F');
});
test('SWAP exchanges arbitrary complex states and compiles into three counted CNOTs',()=>{
  const s=[[.5,0],[0,.5],[-.5,0],[0,-.5]];
  assert.deepEqual(C.evolve([{type:'SWAP',control:0,target:1}],2,s).state,[s[0],s[2],s[1],s[3]]);
  const graph=graphOf(2,[{type:'SWAP',control:0,target:1}]);const c=C.compile(graph,[],2);
  assert.equal(c.count,3);assert.equal(c.depth,3);near(C.operatorScore(c.gates,[{type:'SWAP',control:0,target:1}],2),1);
});
test('neighbor routing restores every middle input and rejects a direct nonlocal shortcut',()=>{
  const swap=saved('Swap'), correct=C.grade('routing',C.solution('routing',[swap]),[swap]);assert.equal(correct.passed,true);assert.equal(correct.count,7);
  const shortcut=graphOf(3,[CX(0,2)],'routing'), bad=C.grade('routing',shortcut,[swap]);
  assert.equal(bad.tests.filter(t=>t.type==='state').every(t=>t.passed),true);assert.equal(bad.tests.find(t=>t.type==='hardware').passed,false);assert.equal(bad.passed,false);
  assert.equal(C.available(C.getLevel('routing'),{swap:true},[]),false);
});
test('a nonlocal interaction inside a saved preparation cannot bypass the hardware contract',()=>{
  const gates=[H(0),CX(0,1),CX(0,2)], m={id:'nonlocal',kind:'GHZPrep',name:'Nonlocal',qubits:3,gates,graph:graphOf(3,gates)};
  assert.equal(C.moduleContract(m),true);
  const g=C.starter('fanout');g.nodes.push({id:'m',type:'MODULE',moduleId:m.id,x:300,y:120},{id:'last',type:'CX',x:720,y:360});
  g.edges=[C.edge('in0',0,'m',0),C.edge('in1',0,'m',1),C.edge('in2',0,'m',2),C.edge('m',0,'out0',0),C.edge('m',1,'out1',0),C.edge('m',2,'last',0),C.edge('in3',0,'last',1),C.edge('last',0,'out2',0),C.edge('last',1,'out3',0)];
  const r=C.grade('fanout',g,[m]);assert.equal(r.tests[0].passed,true);assert.equal(r.tests.find(t=>t.type==='hardware').passed,false);assert.equal(r.passed,false);
});
test('parity preserves all data bits, includes the old accumulator, and is reversible',()=>{
  const gates=[CX(0,3),CX(1,3),CX(2,3)];
  for(let i=0;i<16;i++){const parity=(i&1)^((i>>1)&1)^((i>>2)&1),expected=i^(parity<<3);near(C.fidelity(C.evolve(gates,4,i).state,C.basis(4,expected)),1);}
  near(C.operatorScore([...gates,...gates],[],4),1);const r=C.grade('parity',C.solution('parity'));assert.equal(r.tests.length,17);
});
test('Deutsch distinguishes all truth tables and the auxiliary sign cannot be omitted',()=>{
  const g=C.solution('kickback'),r=C.grade('kickback',g);assert.equal(r.passed,true);assert.equal(r.count,6);assert.equal(r.tests.filter(t=>t.type==='state').length,4);
  for(const table of ['00','01','10','11']) {
    const gates=C.compile(g,[],2,table).gates, state=C.evolve(gates,2).state, answer=Number(table[0]!==table[1]);
    near(C.marginals(state)[0].p1,answer);near(C.marginals(state)[1].p1,.5);near(C.fidelity(state,C.cases(C.getLevel('kickback')).find(c=>c.message===table).expected),1);
  }
  const bad=C.clone(g),x=bad.nodes.find(n=>n.type==='X');x.type='H';assert.equal(C.grade('kickback',bad).passed,false);
});
test('Bernstein–Vazirani reveals all eight secrets with one fixed query and the right bit order',()=>{
  const g=C.solution('oracle'),r=C.grade('oracle',g);assert.equal(r.passed,true);assert.equal(r.count,11);assert.equal(r.tests.length,9);
  for(const secret of C.labels(3)) {
    const c=C.compile(g,[],4,secret),state=C.evolve(c.gates,4).state,index=parseInt(secret,2);
    near(C.probabilities(state)[index],.5);near(C.probabilities(state)[index+8],.5);
    C.marginals(state).slice(0,3).forEach((q,i)=>near(q.p1,Number(secret[2-i])));
  }
  const replaced=C.clone(g);replaced.nodes.find(n=>n.id==='oracle').oracle='deutsch';assert.throws(()=>C.grade('oracle',replaced),/fixture/);
  const copied=C.clone(g);copied.nodes.push({...copied.nodes.find(n=>n.id==='oracle'),id:'second-query'});assert.throws(()=>C.grade('oracle',copied),/Extra fixed/);
});
test('four-port and six-port custom blocks map their local gates to the connected register',()=>{
  const m=saved('Parity'),g=C.starter('sandbox',6);g.nodes.push({id:'parity',type:'MODULE',moduleId:m.id,x:520,y:120});
  const qs=[2,0,4,5];qs.forEach((q,p)=>g.edges.push(C.edge('in'+q,0,'parity',p),C.edge('parity',p,'out'+q,0)));[1,3].forEach(q=>g.edges.push(C.edge('in'+q,0,'out'+q,0)));
  const c=C.compile(g,[m],6);assert.deepEqual(c.gates.map(({control,target})=>[control,target]),[[2,5],[0,5],[4,5]]);assert.equal(c.count,3);
  const custom={kind:'Custom',qubits:6,gates:[H(5),CX(5,0)]};assert.equal(C.moduleContract(custom),true);
});
test('register and amplitude validation reject corrupt inputs without silent truncation',()=>{
  for(const n of [0,7,2.5]) assert.throws(()=>C.basis(n));
  assert.throws(()=>C.evolve([],2,[[1,0],[1,0],[0,0],[0,0]]),/normalized/);
  assert.throws(()=>C.evolve([],1,[[NaN,0],[0,0]]),/finite/);
  assert.throws(()=>C.evolve([{type:'SWAP',control:0,target:0}],2),/different/);
  assert.equal(C.moduleContract({kind:'Custom',qubits:6,gates:[CX(6,0)]}),false);
});
test('new Qiskit exports prepare supplied inverse inputs and expand selected hidden secrets',()=>{
  const graph=C.solution('uncompute'),python=C.qiskit(C.compile(graph,[],3),3,5,'00','uncompute');
  assert.match(python,/# Bitstrings: C B A/);assert.match(python,/qc\.x\(2\).*prepare input/);assert.match(python,/supplied preparation/);
  const bv=C.qiskit(C.compile(C.solution('oracle'),[],4,'101'),4,0,'101','oracle');assert.match(bv,/QuantumCircuit\(4\)/);assert.match(bv,/qc\.cx\(0, 3\)/);assert.match(bv,/qc\.cx\(2, 3\)/);assert.doesNotMatch(bv,/qc\.cx\(1, 3\)/);
});
