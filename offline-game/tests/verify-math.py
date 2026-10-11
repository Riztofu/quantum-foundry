#!/usr/bin/env python3
"""Independent dense-matrix check; optional developer check requiring NumPy and Node."""
import json
from pathlib import Path
import shutil
import subprocess
import numpy as np

rng = np.random.default_rng(20261011)
fixtures = []
for n in range(1, 7):
    for _ in range(32):
        state = rng.normal(size=2**n) + 1j*rng.normal(size=2**n)
        state /= np.linalg.norm(state)
        gates = []
        for _ in range(40):
            kind = rng.choice(['H', 'X', 'Z', 'CX', 'SWAP'] if n > 1 else ['H', 'X', 'Z'])
            target = int(rng.integers(n))
            gate = {'type': str(kind), 'target': target}
            if kind in ['CX', 'SWAP']:
                gate['control'] = int(rng.choice([q for q in range(n) if q != target]))
            gates.append(gate)
        fixtures.append({'n': n, 'gates': gates, 'initial': [[z.real, z.imag] for z in state]})

root = Path(__file__).resolve().parents[1]
node_code = "const C=require('./source/core.js');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s).map(f=>C.evolve(f.gates,f.n,f.initial,false).state))));"
runtime = shutil.which('node') or shutil.which('bun')
if not runtime:
    raise SystemExit('Install Node.js or Bun to run the independent simulator comparison.')
result = subprocess.run([runtime, '-e', node_code], cwd=root, input=json.dumps(fixtures), capture_output=True, text=True, check=True)
actuals = json.loads(result.stdout)
matrices = {}
single = {'H': np.array([[1,1],[1,-1]])/np.sqrt(2), 'X': np.array([[0,1],[1,0]]), 'Z': np.diag([1,-1])}
def matrix(n, gate):
    key=(n,gate['type'],gate['target'],gate.get('control'))
    if key in matrices:
        return matrices[key]
    size=2**n
    if gate['type'] in single:
        m=np.array([[1.0]])
        for q in reversed(range(n)):
            m=np.kron(m, single[gate['type']] if q==gate['target'] else np.eye(2))
    else:
        m=np.zeros((size,size))
        for column in range(size):
            bit=list(format(column,f'0{n}b'))
            c=n-1-gate['control'];t=n-1-gate['target']
            if gate['type']=='CX' and bit[c]=='1':
                bit[t]='1' if bit[t]=='0' else '0'
            if gate['type']=='SWAP':
                bit[c],bit[t]=bit[t],bit[c]
            m[int(''.join(bit),2),column]=1
    matrices[key]=m
    return m

worst=0.0
for fixture, actual in zip(fixtures, actuals):
    expected=np.array([complex(*a) for a in fixture['initial']])
    for gate in fixture['gates']:
        expected=matrix(fixture['n'],gate)@expected
    actual=np.array([complex(*a) for a in actual])
    error=float(np.max(np.abs(actual-expected)))
    assert error<1e-12, (fixture['n'],error)
    assert abs(np.vdot(actual,actual).real-1)<1e-12
    worst=max(worst,error)
print(f'{len(fixtures)} independent complex-state matrix comparisons passed (1–6 qubits, 40 gates each). Maximum amplitude error: {worst:.3g}.')
