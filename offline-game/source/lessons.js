// Original lesson content. Examples run through the same exact simulator as the game.
// Written ground-up for beginners: every term is defined in plain language before it
// is used (per-lesson "words"), with a from-zero primer and a full dictionary.
(function (root) {
  'use strict';
  const r = Math.SQRT1_2;
  const bellInputs = [
    { label: 'Φ+', initial: [[r,0],[0,0],[0,0],[r,0]] },
    { label: 'Φ−', initial: [[r,0],[0,0],[0,0],[-r,0]] },
    { label: 'Ψ+', initial: [[0,0],[r,0],[r,0],[0,0]] },
    { label: 'Ψ−', initial: [[0,0],[r,0],[-r,0],[0,0]] }
  ];
  const X = {type:'X',target:0}, H = {type:'H',target:0}, Z = {type:'Z',target:0}, CX = {type:'CX',control:0,target:1};
  const bits = n => Array.from({length:1 << n}, (_,i) => ({label:i.toString(2).padStart(n,'0'),initial:i}));

  // ── Start from zero: a primer that assumes nothing ─────────────────────────
  const primer = [
    { title: 'Bits, then qubits', body: [
      'Everything a normal computer does is built from bits. A bit is just a switch: it is either 0 or 1, off or on. Your laptop is billions of these switches flipping very fast. That is the whole story — a bit is never anything other than 0 or 1.',
      'A qubit (“quantum bit”) is the quantum version of a switch. When you READ a qubit, you still always get a plain 0 or 1 — never anything else. The difference is what it can be doing BEFORE you read it: in between readings, a qubit can lean partly toward 0 and partly toward 1 at the same time. Not “secretly one of them” — truly both, in a way this game will let you see and use.',
      'One more piece of costume to get out of the way: physicists write the two readable answers as |0⟩ and |1⟩, read “ket zero” and “ket one”. The funny brackets just mean “a qubit state”. There is nothing mathematical hiding in the brackets themselves — they are a label, like quotation marks.'
    ]},
    { title: 'Amplitudes: the numbers underneath', body: [
      'Here is the one piece of math the whole game runs on. A qubit between readings keeps a number for EACH possible answer. That number is called the amplitude of the answer. If a qubit has amplitude 1 for |0⟩ and amplitude 0 for |1⟩, it is plainly 0. If both amplitudes are 0.707, it leans equally toward both.',
      'Amplitudes turn into chances by a single rule: the probability of reading an answer is that answer’s amplitude multiplied by itself. 0.707 × 0.707 ≈ 0.5, so an amplitude of 0.707 means a 50% chance. Amplitude 1 means certainty. Amplitude 0 means never.',
      'And now the twist that makes quantum different from dice: an amplitude can be NEGATIVE. −0.707 also squares to 50%, so a minus sign is invisible when you read the qubit… but the sign is still there, and later steps can make it matter. Hold that thought — it becomes the punchline of mission 4.',
      'Now stop reading and drag. The slider below sets the lean; the bars are the two amplitudes; the percentages follow the squaring rule live. Then tick the box to make an amplitude negative — and watch the chances refuse to care.'
    ]},
    { title: 'Measurement: asking the question', body: [
      'Reading a qubit is called measurement. Measurement forces the qubit to commit: it answers 0 or 1, at random, with the chances given by the squared amplitudes. After it answers, the in-between lean is gone — the qubit now simply IS the answer it gave.',
      'Because measuring disturbs the qubit, you cannot peek at amplitudes directly on real hardware. You can only prepare a fresh qubit, measure it once, and repeat many times to see the pattern. That is exactly what the game’s “Sample output” button does: every shot builds your circuit again from scratch and measures once.',
      'This game is also a friendly training ground: its State panel shows you the exact amplitudes at every step, like an x-ray real hardware can never give you. The panel always tells you which view you are getting.',
      'Try it below. Every press prepares a fresh 50/50 qubit and asks it once. Single answers are always plain 0s and 1s — only the growing tally reveals the lean.'
    ]},
    { title: 'Interference: why the minus sign is the superpower', body: [
      'If qubits were just “random until read”, they would be fancy coins and nobody would build computers out of them. The reason they are more: amplitudes ADD. When two paths lead to the same answer, their amplitudes combine — and a +0.5 meeting a −0.5 cancels to zero. The answer becomes impossible. That cancellation is called interference.',
      'A quantum program is choreography: arrange the gates so that amplitudes pointing at WRONG answers cancel each other out, and amplitudes pointing at the RIGHT answer pile up. Then a single measurement reads off the right answer with high probability.',
      'That is the honest version of “quantum computers try everything at once”. They do explore alternatives together — but a naive read-out would just give you a random alternative. The skill, and this game, is in making the alternatives interfere so the readout is the one you wanted.',
      'See for yourself below: two paths of equal strength arrive at the answer “0”. Flip one sign and a guaranteed answer becomes an impossible one. That switch is the entire difference between quantum machinery and dice.'
    ]},
    { title: 'How the workshop works', body: [
      'You build circuits: qubits flow along amber wires from INPUT terminals on the left to OUTPUT terminals on the right, passing through gates — small machines that change amplitudes in precise, reversible ways. Pick a part from Parts, click the board to place it, click an output pin then an input pin to wire them. Every pin needs a connection.',
      'The test controller (left) chooses an input and lets you Play or Step through the circuit one gate at a time while the State panel shows the amplitudes change. Sample output measures the finished circuit many times. Check circuit grades your build against the mission’s contract — and a passing component can be saved as a block you reuse in later missions.',
      'Each mission’s Assignment panel has three tabs: Build (the goal), How it works (the idea, with a live example you can step through), and Try & observe (an experiment to run). New words are defined at the top of “How it works”, and the whole vocabulary lives in the Dictionary (Menu ≡). You never need anything that has not been explained first.'
    ]}
  ];

  // ── The Foundry dictionary: every term in plain words ───────────────────────
  const glossary = [
    ['bit', 'An ordinary switch: always exactly 0 or 1. Everything in a normal computer is bits.'],
    ['qubit', 'The quantum version of a bit. Reads as 0 or 1, but between readings it can lean toward both at once. A = q0 is the first qubit, B = q1 the second, and so on.'],
    ['|0⟩, |1⟩ (“ket”)', 'The standard costume for writing qubit states. |0⟩ is “the state that reads 0”. The brackets are just a label.'],
    ['state', 'A complete description of what the qubits are doing right now: one amplitude per possible answer.'],
    ['amplitude', 'The number a state keeps for one possible answer. Can be positive or negative. Squaring it gives the probability of reading that answer.'],
    ['probability', 'The chance of an answer when you measure: amplitude × amplitude. 0.707² ≈ 50%.'],
    ['measurement', 'Reading the qubits. Forces one definite answer, at random, weighted by the probabilities — and erases the in-between lean.'],
    ['shot / sample', 'One complete run: prepare the circuit fresh, measure once. “Sample output” takes hundreds of shots and shows the tally.'],
    ['superposition', 'A state leaning toward several answers at once, each with its own amplitude. Not “unknown” — genuinely both, until measured.'],
    ['phase / sign', 'The sign (+ or −) carried by an amplitude. Invisible to a single measurement, decisive under interference.'],
    ['interference', 'What happens when amplitudes meeting at the same answer add up or cancel out. The power source of every quantum algorithm.'],
    ['gate', 'A machine part that changes amplitudes in a precise, reversible way. The quantum version of a logic gate.'],
    ['wire', 'The amber path one qubit follows between gates. A wire can never split into two copies of a qubit (physics forbids copying — “no-cloning”).'],
    ['circuit', 'Gates and wires from inputs to outputs. The quantum version of a program.'],
    ['X gate', 'Quantum NOT: swaps |0⟩ and |1⟩ (it swaps their amplitudes).'],
    ['H gate (Hadamard)', 'The superposition-maker: turns a definite 0 into an equal lean toward 0 and 1. Applied twice, it undoes itself.'],
    ['Z gate', 'The sign-flipper: makes the |1⟩ amplitude negative, changing phase but not probabilities.'],
    ['CNOT (controlled NOT)', 'A two-qubit gate: flips the TARGET qubit only when the CONTROL qubit is 1. The control passes through unchanged.'],
    ['SWAP', 'Exchanges the states of two qubits — the states move, the wires stay put.'],
    ['entanglement', 'Two or more qubits sharing one joint state that cannot be split into separate individual states. Their answers are linked however far apart they are.'],
    ['Bell pair', 'The simplest entangled pair: (|00⟩ + |11⟩)/√2. Measured together, the two qubits always agree.'],
    ['register', 'A row of qubits worked on together (this game supports up to six).'],
    ['bitstring (B A order)', 'A joint answer written highest qubit first: with two qubits, “10” means B reads 1 and A reads 0 — the same order Qiskit uses.'],
    ['reversible', 'Every quantum gate can be undone; no information is destroyed inside a circuit. Only measurement is one-way.'],
    ['oracle', 'A sealed circuit implementing an unknown function. Algorithm missions ask you to learn about what is inside using as few queries as possible.'],
    ['ideal simulator', 'What this game runs: exact amplitudes, no noise. Real hardware only ever gives you shots.']
  ];

  const lessons = {
    link: {
      words: [
        ['qubit', 'the quantum version of a bit — reads as 0 or 1, can lean toward both between readings'],
        ['|0⟩ and |1⟩', 'the two readable answers; the brackets are just how physicists label a qubit state'],
        ['wire', 'the amber path one qubit follows; it can be routed anywhere but never split into copies'],
        ['circuit', 'wires and parts from the INPUT side to the OUTPUT side — a quantum program']
      ],
      goal: 'Build an unbroken path that delivers the input qubit unchanged, from INPUT A to OUTPUT A.',
      provided: 'One input terminal and one output terminal. No gates yet — this first mission is about routing, not changing anything.',
      build: 'Click the orange pin on the right of INPUT A. Then click the orange pin on the left of OUTPUT A. A wire should join them.',
      concepts: [
        'Start with what a qubit is. A bit is a switch: always exactly 0 or 1. A qubit is the quantum version — whenever you read it you still get a plain 0 or 1, but between readings it can lean partly toward both at once. We write the two readable answers as |0⟩ and |1⟩, said “ket zero” and “ket one”; the brackets are just the standard costume for “a qubit state”, nothing more.',
        'In this workshop, one qubit travels along one amber wire, left to right. A wire is gentler than it looks: it carries the qubit without disturbing it at all. But it has one hard rule that copper wires do not: a quantum wire cannot split to copy an unknown state. Physics itself forbids duplicating a qubit (the “no-cloning” rule), so every output pin feeds exactly one input pin, always. Two wires crossing on the board are just a drawing — they never join.'
      ],
      note: 'Pins on a part’s left receive a qubit; pins on its right send it onward. Where you place a part changes the drawing, never the computation.',
      experiment: ['Connect the two terminals.', 'In the test controller, choose input 0, then input 1. Watch the probability readout follow your choice — whatever goes in comes out.', 'Click Check circuit. The test bench must pass both cases.'],
      observe: 'A working wire preserves both inputs. You have built the identity operation — the simplest possible quantum circuit — and the board, bench, and checker are now familiar.',
      checks: ['Input |0⟩ arrives as |0⟩, and input |1⟩ arrives as |1⟩.', 'The complete operation must also preserve coherent inputs.'],
      hints: ['This assignment is about a connection, not an operation. There are no parts to place.', 'Start with the right-hand orange pin on INPUT A.', 'Click INPUT A’s output pin, then OUTPUT A’s input pin. Press Check circuit.'],
      example: {title:'A wire preserves the state',qubits:1,inputs:bits(1),gates:[],captions:['Choose 0 or 1. With no gates, the input state is also the output state.']}
    },
    invert: {
      words: [
        ['gate', 'a part that changes a qubit as it passes through — the quantum version of a logic gate'],
        ['X gate', 'quantum NOT: turns |0⟩ into |1⟩ and |1⟩ into |0⟩'],
        ['reversible', 'every quantum gate can be undone — two X gates cancel out; nothing is ever erased']
      ],
      goal: 'Make every 0 become 1, and every 1 become 0.',
      provided: 'Your first gate: X. Plus the two terminals. A passing circuit can be saved as your reusable Inverter block.',
      build: 'Choose X from Parts, then click between the terminals to place it. Connect the terminals through your gate — every pin in the circuit needs a path.',
      concepts: [
        'A gate is a machine part that changes the qubit passing through it. The X gate is the quantum version of NOT: it swaps the two answers, so X turns |0⟩ into |1⟩ and |1⟩ into |0⟩. If the qubit was leaning toward both answers, X simply swaps the two leans (the amplitudes trade places; their signs come along unchanged).',
        'Here is a deep rule you get for free: every quantum gate is reversible. Nothing is erased, ever — run X twice and you are exactly back where you started. That is also why the tester is stricter than it looks: your circuit must be right for BOTH plain inputs, and for every in-between lean too. A part that only works on 0s and 1s is not a quantum part.'
      ],
      note: 'Passing on one input is not enough. A reusable Inverter promises the same operation for every possible input.',
      experiment: ['Build a circuit containing X.', 'Choose 0 and press Step. Restart, choose 1, and press Step again. Watch the answer swap both times.', 'Check circuit, then save your circuit in the success dialog. Its actual gates become a reusable block.'],
      observe: 'Both inputs swap. Your Inverter is a real circuit you built and can reopen later — not a preset answer. Build, verify, reuse: that is the whole game.',
      checks: ['Both input states must swap.', 'A complete operation check also rejects input-dependent phase errors.'],
      hints: ['Which available operation exchanges the two basis states?', 'A gate needs an incoming path and an outgoing path.', 'Connect INPUT A → X → OUTPUT A. Check circuit, then save Inverter.'],
      example: {title:'X is reversible',qubits:1,inputs:bits(1),gates:[X,X],captions:['Choose an input state.','One X swaps 0 and 1.','A second X restores the original state.']}
    },
    superposition: {
      words: [
        ['superposition', 'a genuine both-at-once lean toward 0 and 1 — not “secretly one of them”'],
        ['amplitude', 'the number a state keeps for each answer; probability = amplitude × amplitude'],
        ['H gate (Hadamard)', 'the superposition-maker: splits a definite 0 into equal leans toward 0 and 1'],
        ['measurement', 'reading the qubit — it commits to 0 or 1 at random, weighted by the probabilities']
      ],
      goal: 'From |0⟩, prepare equal positive amplitudes for 0 and 1 — the state physicists call |+⟩.',
      provided: 'X and H gates. The input is fixed to |0⟩ for this preparation task.',
      build: 'Place the gate that can turn a definite input into a both-at-once state. Connect a complete path, then open State and look at the numbers before you press Check.',
      concepts: [
        'Time to make something actually quantum. First, the bookkeeping: between readings, a qubit keeps one number per possible answer, called that answer’s amplitude. Squaring an amplitude gives the probability of reading that answer: amplitude 1 means certain, 0 means never, and 0.707 means 0.707 × 0.707 ≈ 50%. That squaring rule is the only math this game ever needs.',
        'The H gate (Hadamard) is the superposition-maker. Feed it a definite |0⟩ and it produces amplitudes of +0.707 for BOTH answers: an equal, genuine both-at-once lean called |+⟩. Measure it and you get 0 half the time, 1 half the time. So far it looks like a coin flip…',
        '…but it is not one, and here is the proof you can run yourself: apply H a second time and the qubit returns to a definite 0. Every time. A real coin flip cannot be unflipped — randomness that can be undone was never randomness at all. The two leans kept a precise relationship (both positive, both 0.707), and the second H folds them back together. Keeping relationships like that is called coherence, and it is what the whole Foundry runs on.'
      ],
      note: 'The goal includes the positive sign on both amplitudes. A different state can give the same 50/50 chances and still fail — the signs are part of the state.',
      experiment: ['Build the preparation and press Step. In State, look for two +0.707 amplitudes.', 'Press Sample output. Fresh preparations should come up roughly half 0, half 1 — exact counts wobble, and that wobble is real measurement randomness.', 'In Sandbox, try two H gates in a row. Step after each one and watch the definite 0 come back.'],
      observe: 'Probabilities describe what measurement will say. Amplitudes remember more — including the signs that make the next mission’s magic possible.',
      checks: ['The full output state must match |+⟩ from |0⟩, up to one overall phase.', 'Random measurement counts do not decide whether the circuit passes.'],
      hints: ['An X only swaps definite 0 and 1. Which part changes the amplitudes themselves?', 'Try the Hadamard gate on |0⟩ and inspect State.', 'Connect INPUT A → H → OUTPUT A. Your target is two equal positive amplitudes.'],
      example: {title:'A superposition can interfere',qubits:1,inputs:[{label:'0',initial:0}],gates:[H,H],captions:['The starting state has a definite 0.','H creates two positive amplitudes: 50% for each outcome.','The second H combines the amplitudes. Outcome 1 cancels; outcome 0 is certain.']}
    },
    phase: {
      words: [
        ['phase / sign', 'the + or − carried by an amplitude; −0.707 gives the same 50% as +0.707'],
        ['Z gate', 'the sign-flipper: makes the |1⟩ amplitude negative and changes nothing else'],
        ['interference', 'amplitudes meeting at the same answer add up or cancel — the quantum superpower']
      ],
      goal: 'Complete the gap between two fixed H gates so that |0⟩ comes out as a certain |1⟩.',
      provided: 'The first and last H gates are already wired in. You place what goes in the middle. Z is now available.',
      build: 'Connect an operation into the gap. Use Restart and Step to watch the state after every gate — especially the middle one.',
      concepts: [
        'Remember that amplitudes can be negative? This mission is where the minus sign earns its keep. The Z gate does exactly one thing: it flips the sign of the |1⟩ amplitude. On the |+⟩ state (+0.707, +0.707) it produces |−⟩ (+0.707, −0.707). Now look at the probabilities: (−0.707)² is still 50%. Z changed the state and measurement cannot see it. Step past the Z and check the State panel yourself — the bar flips downward, the percentages do not move.',
        'So is the hidden sign useless? The opposite. The final H makes the two leans recombine — interference. With both signs positive they fold back into 0; with the signs opposed they fold into 1 instead. A difference no single measurement could detect becomes a certainty you can read. You just converted phase into an answer.',
        'This mission also retires the most famous myth about quantum computers: they cannot “try every answer at once and just look at the result”. Secretly marking an answer (with a sign, say) is invisible to readout, as you just proved. Every real quantum algorithm is an interference arrangement like your little H–Z–H machine, scaled up: it converts hidden phase into readable bits. You now know the trick at the heart of the entire field.'
      ],
      note: 'A minus sign is not a negative probability. Probability is the squared amplitude, so it is always zero or positive.',
      experiment: ['Finish the middle path and press Restart.', 'Step through the first H, then your middle gate. Compare the signed bars with the probability readout: the bars change, the percentages do not.', 'Step through the final H. The target is a certain 1. Then Check circuit.'],
      observe: 'The probability readout alone could never reveal the middle sign flip. The final H turns that hidden difference into a measurable bit — interference converted phase into information.',
      checks: ['From the supplied |0⟩ input, the final state must be |1⟩.', 'Both fixed H gates and their supplied terminal connections must stay intact.'],
      hints: ['The first H prepares equal positive amplitudes. What should happen to their relative sign?', 'Z changes one amplitude’s sign without changing its magnitude.', 'Place Z in the gap and connect H → Z → H. After the final H, the output is |1⟩.'],
      example: {title:'Same probabilities, different phase',qubits:1,inputs:[{label:'+',initial:[[r,0],[r,0]]}],gates:[Z,H],captions:['The |+⟩ state has equal positive amplitudes.','Z makes the |1⟩ amplitude negative. Both probabilities are still 50%.','H reveals the relative sign: the final result is a certain 1.']}
    },
    cnot: {
      words: [
        ['CNOT', 'controlled NOT: flips the target qubit only when the control qubit is 1'],
        ['control / target', 'the deciding qubit (upper pin) and the flipped qubit (lower pin)'],
        ['bitstring B A', 'two-qubit answers are written B first, then A — “10” means B=1, A=0 (Qiskit’s order too)']
      ],
      goal: 'Flip B exactly when A is 1. Leave A itself unchanged.',
      provided: 'Your first two-qubit gate: CNOT. Its upper path is CONTROL; its lower path is TARGET. H, X, and Z are also on the shelf.',
      build: 'Route qubit A through the control port and qubit B through the target port. Each output must return to its matching terminal.',
      concepts: [
        'One qubit is a solo instrument; from here on you wire ensembles. The CNOT (“controlled NOT”) is a gate with two separate qubit paths and one rule: if the control qubit is 1, flip the target qubit; if the control is 0, do nothing. The control itself passes through untouched either way — its pin does not measure it, copy it, or use it up.',
        'Two qubits also need a reading convention. With A and B there are four possible joint answers, written as two-character bitstrings in the order B A (highest qubit first, matching Qiskit). So “01” means B reads 0 and A reads 1 — and since A is the control, input 01 becomes 11, while 10 (A=0) stays 10. The corner badge reminds you of the order whenever you forget.',
        'CNOT looks like an ordinary IF-statement, and on plain 0s and 1s it is one. The quantum part: the control can be in superposition — and then the gate acts on every lean at once, coherently. A conditional that can run “both branches at once” is exactly the ingredient the next mission needs.'
      ],
      note: 'C and T label the control and target ports. The two wires carry separate qubits; a wire crossing is not a connection.',
      experiment: ['Build the controlled operation with both complete paths.', 'Choose 00, 01, 10, and 11 in turn. Step once and read each result as B A.', 'Check circuit and save the passing circuit as ControlledFlip.'],
      observe: 'Only the cases with A=1 flip B: 01 → 11 and 11 → 01. And A itself never changes. You now control one qubit with another.',
      checks: ['All four basis inputs must obey the control rule.', 'The complete coherent operation must match CNOT with A as control and B as target.'],
      hints: ['Treat the upper and lower CNOT pins as two separate paths.', 'A is the control, B is the target. Bitstrings display B first.', 'Connect A through C, B through T, then connect the upper output to A and the lower output to B.'],
      example: {title:'Choose a basis input · displayed as B A',qubits:2,inputs:bits(2),gates:[CX],captions:['Read the right-hand bit as control A.','CNOT changes B exactly when A=1. A stays unchanged.']}
    },
    bell: {
      words: [
        ['entanglement', 'two qubits sharing one joint state that cannot be split into two separate stories'],
        ['Bell pair', 'the simplest entangled state: (|00⟩ + |11⟩)/√2 — the two always agree when measured'],
        ['joint state', 'one set of amplitudes for the whole pair: four numbers for two qubits, one per bitstring']
      ],
      goal: 'From |00⟩, make a pair whose joint state is (|00⟩ + |11⟩)/√2 — a Bell pair.',
      provided: 'Your saved ControlledFlip block and the primitive gates. Save your passing construction as BellPrep.',
      build: 'Start with both qubits at 0. Create two alternatives on one qubit, then make the other qubit join those alternatives coherently.',
      concepts: [
        'Time to forge the Foundry’s signature alloy. Put A into superposition with H — now the pair leans toward 00 and 01 (B still 0 in both). Then run A through a controlled flip onto B: in the lean where A is 1, B flips too. The result has amplitudes only for 00 and 11, 0.707 each. Measure both qubits and they ALWAYS agree — half the time both say 0, half the time both say 1, never one of each.',
        'That agreement is stranger than it sounds. Neither qubit alone has an answer (each is 50/50 by itself), yet their answers are guaranteed to match. The information is stored in the relationship, not in either qubit — that is entanglement. Two ordinary coins can only agree if someone set them to agree in advance; an entangled pair generates its agreement fresh at measurement, whatever you later choose to do.',
        'One caution for your inner skeptic: a pair of coins somebody secretly set to matching values ALSO shows “always agree, 50/50 each”. What makes the Bell pair different is that it is one coherent state with a definite + sign connecting its two alternatives — and the next mission builds the instrument that can tell the difference. The contract therefore checks the full state, sign included: (|00⟩ − |11⟩)/√2 gives identical counts and still fails.'
      ],
      note: 'BellPrep is a preparation block with an input assumption: |00⟩. Its name does not promise a Bell pair for arbitrary inputs.',
      experiment: ['Build the preparation and Step through it. Watch the joint amplitudes after each operation.', 'At the end, only 00 and 11 should have amplitudes. Sample output and confirm 01 and 10 never appear.', 'Check circuit and save BellPrep — it becomes half of your final communication device.'],
      observe: 'A superposition plus a controlled flip welds two qubits into one joint state. The State panel’s entanglement score reads 1: fully linked.',
      checks: ['The complete state from |00⟩ must match the positive Bell state.', 'A 50/50 classical-looking histogram is insufficient without the correct coherent state.'],
      hints: ['How can you create two alternatives on A while B starts at 0?', 'A superposition on A followed by a controlled flip can correlate both paths.', 'Route A through H, then through CNOT’s control. Route B through the target. Connect both outputs and save BellPrep.'],
      example: {title:'From separate inputs to a joint state',qubits:2,inputs:[{label:'00',initial:0}],gates:[H,CX],captions:['Both qubits begin in 0.','H on A creates 00 and 01: B is still 0.','CNOT maps 01 to 11. The two equal positive terms form a Bell pair.']}
    },
    decode: {
      words: [
        ['Bell basis', 'the four Bell states Φ+, Φ−, Ψ+, Ψ− — an alternative “alphabet” for a pair of qubits'],
        ['inverse circuit', 'the same gates run in reverse order; since each gate undoes itself, it unwinds the original']
      ],
      goal: 'Turn four different Bell states into four different definite bitstrings.',
      provided: 'Four selectable Bell inputs, your ControlledFlip block, and the primitive gates. Save the verified decoder as BellDecode.',
      build: 'Undo the Bell preparation. Each gate is its own inverse — but a SEQUENCE must be undone back to front, like taking off shoes before socks.',
      concepts: [
        'There are four Bell states, not one. Φ+ and Φ− both answer “00 or 11, fifty-fifty”; Ψ+ and Ψ− both answer “01 or 10”. Within each pair, the only difference is a hidden sign — exactly the kind of difference you proved measurement cannot see in mission 4. Measured directly, Φ+ and Φ− are indistinguishable. Your job: build the instrument that tells all four apart anyway.',
        'The trick is reversibility. Preparation was “H, then controlled flip”, and both gates undo themselves — so run the recipe backwards: controlled flip first, then H on A. Each Bell state “un-prepares” into a different plain bitstring (00, 01, 10, 11) that an ordinary measurement reads right off. Just like mission 4’s final H, the decoder converts hidden sign differences into readable bits — this time for a pair.',
        'The bench checks the full coherent operation too, because a real decoder must work on any mixture of inputs, not just the four showcase states.'
      ],
      note: 'The supplied inputs are already entangled states. Build the receiver only; do not prepend a new preparation block.',
      experiment: ['Build the inverse of the Bell preparation.', 'Select each Bell input and Step. By the last operation, one bitstring should sit at 100%.', 'Check all four cases, then save BellDecode — it is Bob’s receiver in the final mission.'],
      observe: 'Four states that partly looked identical became four distinct answers. Reading entanglement means running its preparation backwards.',
      checks: ['Φ+ → 00; Φ− → 01; Ψ+ → 10; Ψ− → 11, up to overall phase.', 'The complete coherent decoding operation must also be correct.'],
      hints: ['Your preparation used two operations. Which one happened last?', 'Undo the controlled flip before undoing the Hadamard on A.', 'Route both paths through CNOT, then A through H. B goes directly to its output. Save BellDecode after checking.'],
      example: {title:'A basis change reveals the Bell label',qubits:2,inputs:bellInputs,gates:[CX,H],captions:['Choose one of the four supplied Bell states.','The controlled flip separates the correlated alternatives.','H on A turns the relative sign into a definite bit. Read the result as B A.']}
    },
    courier: {
      words: [
        ['superdense coding', 'sending two classical bits by shipping one qubit — paid for with a pre-shared Bell pair'],
        ['pre-shared entanglement', 'a Bell pair distributed ahead of time; the consumable fuel of the protocol']
      ],
      goal: 'Deliver all four two-bit messages using your saved preparation and decoder.',
      provided: 'Your BellPrep and BellDecode blocks, Alice’s fixed encoder, and a fixed SEND A link. Primitive gates are intentionally unavailable — the device is assembled from parts you built.',
      build: 'Place BellPrep before the encoder and BellDecode at Bob’s receiver. A travels through Alice’s encoder and SEND A; B connects from the preparation straight to the decoder.',
      concepts: [
        'Final commission. Normally, sending one bit delivers one bit — that is not an engineering limit, it is information theory. This device beats it, legally, using superdense coding. The setup: Alice and Bob share a Bell pair IN ADVANCE (your BellPrep). Alice keeps qubit A; B is already with Bob before any message exists.',
        'To send the two-bit message cd, Alice touches ONLY her own qubit: Z if d=1, then X if c=1 (the fixed ENCODE block applies this). Those four small local nudges steer the whole pair into the four different Bell states — flipping or sign-flipping one half re-aims the joint state, as you saw in the decoder mission. Then she ships the single qubit A to Bob.',
        'Bob now holds both qubits and runs your BellDecode: the Bell state un-prepares into plain bits, B=c and A=d, so the displayed bitstring B A literally spells the message. Keep honest books, though: two bits arrived while one qubit traveled, but the pre-shared pair was spent as fuel — and qubit A still had to physically make the trip, so nothing outran light. Entanglement is a resource, not a radio.'
      ],
      note: 'No information is sent just by creating entanglement. Bob must receive A and jointly decode the two qubits to recover the message.',
      experiment: ['Wire your two saved blocks around the supplied encoder and send link. Keep B on its separate path.', 'Choose 00, 01, 10, and 11 as Alice’s message. Step through each, then sample the final output.', 'Check circuit. All four messages and both saved-component requirements must pass.'],
      observe: 'Every message arrives intact — through a machine assembled entirely from circuits you built, verified, and saved. That is the Foundry’s whole philosophy in one device.',
      checks: ['Each message cd must arrive as output B A = cd.', 'Both an actual saved BellPrep and an actual saved BellDecode must be present.', 'The fixed encoding and transfer fixtures stay in the circuit.'],
      hints: ['The final device connects your earlier circuits rather than adding new primitive gates.', 'A visits Alice and then Bob. B is already held by Bob and bypasses Alice’s encoder.', 'A: input → BellPrep → encoder → SEND A → BellDecode → output. B: input → BellPrep → BellDecode → output.'],
      example: {title:'Choose Alice’s message cd',qubits:2,inputs:['00','01','10','11'].map(message => ({label:message,initial:0,message})),courier:true}
    },
    sandbox: {
      words: [],
      goal: 'Build and inspect your own circuits on a register of one to six qubits.',
      provided: 'X, H, Z, CNOT, SWAP, and saved blocks that fit your register. Use Register above the board to switch sizes; each size keeps its own circuit.',
      build: 'Complete every input-to-output path. Unused qubits can take direct wires. Blocks can have up to six ports, and the board accepts 160 parts.',
      concepts: ['The same simulator and wiring rules apply here, with no pass/fail contract. Start from a basis input, build any reversible circuit, and step through its states at your own pace.', 'Compare the State and Measurements views as you go: State is the x-ray (exact signed amplitudes the simulator can see), Measurements is reality (only the answers fresh preparations can give).'],
      note: 'Each register size saves a separate Sandbox circuit. These experiments do not earn campaign progress. Download a backup to move all of them to another computer.',
      experiment: ['Try two X gates or two H gates on A and a direct wire on B. Verify the original input returns.', 'Build a Bell preparation and compare its joint outcomes with H applied independently to both qubits.', 'Save a valid circuit as a custom block, or use the menu to export Qiskit Python.'],
      observe: 'A block can make a larger circuit easier to read, but its internal primitive gates still count toward cost and depth.',
      checks: ['Every qubit path must be connected, without fanout, merging, or cycles.', 'All placed parts must belong to the completed circuit.'],
      hints: ['Every input needs a path to its matching output, including unused qubits.', 'Use Register to choose one to six qubits, then Fit to see the whole schematic.', 'Save a valid circuit as a reusable custom block. Menu → Download backup includes your circuits at every register size.'],
      example: {title:'Explore a two-qubit preparation',qubits:2,inputs:bits(2),gates:[H,CX],captions:['Choose a basis input, displayed as B A.','H changes A’s amplitudes.','CNOT makes B respond coherently to A. Different inputs produce different Bell states.']}
    }
  };
  const h = target => ({type:'H',target}), x = target => ({type:'X',target}), cx = (control,target) => ({type:'CX',control,target});
  const ghz = [h(0),cx(0,1),cx(1,2)];
  Object.assign(lessons, {
    swap: {
      words: [
        ['SWAP', 'exchanges the states of two qubits — the states move, the physical wires stay put'],
        ['routing', 'moving quantum information around a chip using reversible operations']
      ],
      goal: 'Exchange the states carried by A and B, using only controlled flips.',
      provided: 'Two qubit paths and CNOT gates. A passing circuit can become your reusable Swap block.',
      build: 'Construct the exchange as a sequence of controlled operations. Wire each physical path back to its matching output; do not just cross the terminal wires.',
      concepts: [
        'New chapter: architecture — the engineering of where quantum information lives. A SWAP exchanges the states of two qubits: input B A = 01 must leave as 10, and 10 as 01, while 00 and 11 stay put. Note what is NOT allowed: simply crossing the wires on the drawing. That renames the picture; a SWAP moves the actual states between the physical qubits.',
        'The classic construction is three controlled flips in alternating directions: A→B, then B→A, then A→B. Watch it work on 01: the first flip makes it 11, the second makes it 10, the third leaves 10 alone. Each step is reversible, and the coherent-operation check confirms superpositions get exchanged correctly too — a real SWAP, not a lookup table.'
      ],
      note: 'Swapping states is reversible. Two complete Swap blocks restore both inputs. The block still costs three CNOT operations.',
      experiment: ['Build your candidate and choose input 01.', 'Step through the controlled flips. Watch 01 become 11, then 10, then remain 10.', 'Check all inputs and save Swap. The next mission uses your circuit to route information.'],
      observe: 'A and B keep their physical identities while their states trade places. You built a routing primitive out of three conditionals.',
      checks: ['00→00, 01→10, 10→01, 11→11.', 'One coherent operation must match SWAP for every input.'],
      hints: ['A terminal crossing cannot implement a state exchange.', 'Try alternating which qubit controls the flip.', 'Use CNOT A→B, then B→A, then A→B. On the middle gate, route B through CONTROL and A through TARGET.'],
      example: {title:'Exchange without renaming the wires',qubits:2,inputs:bits(2),gates:[cx(0,1),cx(1,0),cx(0,1)],captions:['Choose a B A input.','A controls a flip of B.','B now controls a flip of A.','A controls the final flip. The two original states have exchanged.']}
    },
    routing: {
      words: [
        ['adjacency', 'real chips only let neighboring qubits interact — distant pairs need routing'],
        ['register', 'a row of qubits worked on together; this one is a line A—B—C']
      ],
      goal: 'Make A control a flip of C, while restoring the middle qubit B.',
      provided: 'A three-qubit register, CNOT, and your saved Swap. Hardware links allow A↔B and B↔C only.',
      build: 'Move the state of A next to C, apply the controlled operation, then restore the original arrangement. Use your actual saved Swap block at least once.',
      concepts: [
        'Welcome to a real hardware headache. On an actual quantum chip, qubits are physical objects on a board, and only certain NEIGHBORS can interact — here the register is a line, A—B—C, so A and C cannot touch directly. A straight A→C CNOT is simply not wired into the machine. This constraint is called adjacency, and working around it is called routing.',
        'The workaround uses your Swap: exchange A and B, so A’s state now physically sits next to C. Apply CNOT from there onto C. Then swap back, restoring everything to its original seat — including B, whose state took a round trip and must come home intact for EVERY input, superpositions included. The middle qubit is a colleague, not scratch paper.',
        'Count the bill: two 3-gate swaps plus one CNOT = seven gates to do one “simple” long-range operation. Routing is why real quantum programs care enormously about which qubits sit next to which.'
      ],
      note: 'Adjacency is checked after expanding every saved block. Packaging a forbidden interaction cannot hide it from the hardware check.',
      experiment: ['Place your Swap and route the three complete paths.', 'Try inputs 001 and 011, displayed as C B A. C must flip when A=1, while B keeps its original value.', 'Check all eight inputs, then inspect the expanded gate cost: seven gates.'],
      observe: 'You implemented a long-range operation with purely neighbor-to-neighbor steps. Routing is invisible in the answer and very visible in the cost.',
      checks: ['C changes to C⊕A; A and B are preserved on all eight inputs.', 'The full coherent operation must match CNOT A→C.', 'Use a saved Swap and only neighboring interactions.'],
      hints: ['Where can A’s state move so that it neighbors C?', 'Restore the state locations after the middle controlled flip.', 'Apply Swap A↔B, CNOT B→C, then Swap A↔B. Keep C on its own path through the middle gate.'],
      example: {title:'Neighboring operations reach across a register',qubits:3,inputs:[{label:'001',initial:1},{label:'011',initial:3},{label:'010',initial:2}],gates:[{type:'SWAP',control:0,target:1},cx(1,2),{type:'SWAP',control:0,target:1}],captions:['Read C B A. A is the rightmost bit.','Swap moves A’s state into physical B.','B now holds the control state and flips neighboring C.','Swap back. B is restored, and C reflects the original A.']}
    },
    ghz: {
      words: [
        ['GHZ state', 'three (or more) qubits sharing one all-or-nothing lean: only 000 and 111 remain'],
        ['correlation', 'answers that are linked: learning one tells you about the others']
      ],
      goal: 'Create a coherent shared state across three qubits: only 000 and 111, with equal positive amplitudes.',
      provided: 'A, B, and C start in |000⟩. H, X, Z, CNOT, SWAP, and compatible saved blocks are available. Interactions must be between neighbors.',
      build: 'Start with a superposition on one end of the register. Pass its alternatives down the line of neighbors, then finish all three paths.',
      concepts: [
        'Entanglement is not limited to pairs. The GHZ state is the Bell pair’s big sibling: (|000⟩ + |111⟩)/√2. Measure all three qubits and you get all zeros or all ones — never a mix — while each qubit alone still looks like a 50/50 coin. Three qubits, one shared fate.',
        'The construction is the Bell recipe, extended down the line: H on A opens two alternatives; CNOT A→B brings B into them; CNOT B→C passes the same two alternatives on to C. Each controlled flip recruits one more neighbor into the SAME two leans — it never creates new ones.',
        'Contrast matters here: three separate H gates would produce eight equally likely bitstrings — three independent coins, no link at all. And as with the Bell pair, a classical lottery that secretly mails out matching 000/111 tickets would match the counts but lacks the coherent + sign connecting the alternatives; the next mission’s decoder can tell the difference.'
      ],
      note: 'This preparation block promises the target only from |000⟩. Its gates remain reversible on every input, but its preparation label includes that input assumption.',
      experiment: ['Build the preparation and Step after each operation.', 'Watch two alternatives spread: 000/001, then 000/011, finally 000/111.', 'Sample output, then Check circuit and save GHZPrep.'],
      observe: 'You stretched a shared pair into a shared register, one neighbor at a time. The full-state check includes the sign connecting the two alternatives.',
      checks: ['The entire output state must match positive GHZ from |000⟩.', 'Neighboring interactions are required, including inside blocks.'],
      hints: ['Independent superpositions create too many alternatives.', 'Extend the Bell preparation along the line of neighbors.', 'Use H A, CNOT A→B, then CNOT B→C. Connect every unused segment as a direct path.'],
      example: {title:'One coherent alternative spreads through the register',qubits:3,inputs:[{label:'000',initial:0}],gates:ghz,captions:['All three qubits start at 0.','H on A creates 000 and 001.','A→B correlates the first two qubits: 000 and 011.','B→C creates the three-qubit GHZ state: 000 and 111.']}
    },
    uncompute: {
      words: [
        ['inverse of a sequence', 'undo the LAST step first: the whole recipe runs back to front'],
        ['uncomputation', 'running a circuit in reverse to clean up and recover the original input']
      ],
      goal: 'Undo a supplied GHZ preparation and recover all eight original register inputs.',
      provided: 'Each test input has already passed through H A, CNOT A→B, and CNOT B→C. Your circuit is the decoder only.',
      build: 'Reverse the order of the preparation and undo each gate. Save the passing decoder as GHZDecode.',
      concepts: [
        'Shoes off before socks: to undo a sequence of steps, you undo the LAST step first. For a circuit that applied gate 1, then 2, then 3, the inverse applies the undo of 3, then of 2, then of 1. Merely repeating the original order does not unwind anything — it usually makes new knots.',
        'Here every gate is conveniently its own undo (H twice = nothing; CNOT twice = nothing). So the inverse of “H A, then A→B, then B→C” is simply the same gates back to front: B→C, then A→B, then H A. Run it and each entangled test input returns to the plain register value it was prepared from.',
        'This skill has a name — uncomputation — and real algorithms lean on it constantly: compute something, use it, then run the computation backwards to clean up the workspace without destroying information. The bench checks your decoder as a complete operation, so it must unwind every input, not just reset one showcase state.'
      ],
      note: 'The test controller labels the original input that was prepared. The displayed intermediate amplitudes are the supplied joint state, not that original basis state.',
      experiment: ['Build the decoder and choose Prepared 000.', 'Step until the entangled state collapses back to a definite 000 — with no measurement involved, just reversal.', 'Choose another prepared input, then check all eight cases and save GHZDecode.'],
      observe: 'Entangled information returned, unharmed, to plain register values. You can build any machine and its mirror image from the same parts.',
      checks: ['Every supplied preparation must return its corresponding original basis input.', 'The complete operation must match the inverse preparation coherently.'],
      hints: ['Which operation happened last in the preparation?', 'Undo B→C before undoing A→B.', 'Use CNOT B→C, CNOT A→B, then H A. Do not add another preparation at the input.'],
      example: {title:'Reverse the machine in reverse order',qubits:3,inputs:bits(3),prepare:ghz,gates:[cx(1,2),cx(0,1),h(0)],captions:['The selected basis input has already been prepared.','Undo the last correlation, B→C.','Undo the first correlation, A→B.','Undo H on A. The original register input returns.']}
    },
    parity: {
      words: [
        ['parity', 'whether a group of bits holds an odd number of 1s'],
        ['XOR (⊕)', 'addition that wraps around: 1⊕1 = 0. The reversible way to accumulate bits'],
        ['accumulator', 'a qubit that collects a running result without erasing anything']
      ],
      goal: 'Accumulate the parity of A, B, and C into D while preserving all three data qubits.',
      provided: 'A four-qubit register and reversible gates. Unlike the routing tasks, this logical puzzle allows any pair to interact.',
      build: 'Treat D as an accumulator. Each input bit should toggle D once when that bit is 1. D’s original value must survive inside the result too.',
      concepts: [
        'Two small ideas, then a useful machine. Parity asks: does this group of bits contain an odd number of 1s? XOR (written ⊕) is the adding that answers it — addition that wraps around, so 1⊕1 = 0. The parity of A, B, C is just A⊕B⊕C.',
        'Now the quantum twist. You might want to “write the parity into D” — but overwriting D would destroy its old value, and quantum circuits never destroy information (that is what reversible means). The honest contract is D′ = D ⊕ A ⊕ B ⊕ C: fold the parity INTO D. The circuit is charmingly simple: a CNOT from each data qubit into D — each 1 among the data toggles the accumulator exactly once. A, B, and C sail through untouched.',
        'All sixteen basis inputs get tested, plus the coherent operation — so superposed inputs must follow the same rule. You are now packaging four-port components whose true cost stays visible.'
      ],
      note: 'Bitstrings read D C B A. All sixteen basis inputs are tested, and the operation check also verifies coherence.',
      experiment: ['Build the accumulator. Select 0111: three data ones toggle D three times — to 1 — giving 1111.', 'Select 0011: two data ones toggle D twice, leaving it at 0.', 'Check all inputs and save your four-port Parity block. Inspect its schematic in My components.'],
      observe: 'A tiny primitive, repeated, became a register-level instrument. Reversibility was not a burden — it told you the right contract.',
      checks: ['All sixteen inputs must implement D⊕A⊕B⊕C.', 'A, B, and C must remain unchanged.', 'The coherent operation must match the reversible parity accumulator.'],
      hints: ['A controlled flip adds one input bit into the target modulo two.', 'All three controls should affect the same accumulator qubit.', 'Route D through three targets: CNOT A→D, B→D, then C→D. Return A, B, and C to their matching outputs.'],
      example: {title:'Each control adds one bit modulo two',qubits:4,inputs:[{label:'0111',initial:7},{label:'0011',initial:3},{label:'1001',initial:9}],gates:[cx(0,3),cx(1,3),cx(2,3)],captions:['Read D C B A. D is the leftmost bit.','A toggles D when A=1.','B adds its bit to D by another conditional toggle.','C adds its bit. The three data qubits are preserved.']}
    },
    fanout: {
      words: [
        ['GHZ-4', 'the all-or-nothing state on four qubits: only 0000 and 1111'],
        ['no-cloning (again)', 'this spreads one shared alternative — it does not make copies of a qubit']
      ],
      goal: 'Create (|0000⟩ + |1111⟩)/√2 across a four-qubit line.',
      provided: 'Four zero inputs, the standard gates, and compatible saved blocks. Only neighboring qubits may interact.',
      build: 'Extend the three-qubit shared register by one more neighbor. Connect all four physical paths and preserve the positive relative phase.',
      concepts: [
        'Same melody, one more verse: H on A opens two alternatives, then controlled flips pass them down the line — A→B, B→C, C→D. Sixteen bitstrings are possible on four qubits, and your state keeps exactly two of them, 0000 and 1111, perfectly linked. Each qubit alone still reads as a plain 50/50 coin; only the joint view shows the structure.',
        'Resist one tempting misreading: this chain is NOT a photocopier. Remember from mission 1 that unknown qubit states cannot be copied. What a controlled flip does is recruit a fresh zero qubit into an EXISTING shared alternative. Feed the chain a general superposition and you get deeper entanglement, not four independent duplicates — which is its own kind of useful.'
      ],
      note: 'The register view shows every joint amplitude. The slim controller shows the most likely outcomes and each qubit’s marginal probability.',
      experiment: ['Build the preparation and Step along the line.', 'Compare the two nonzero joint outcomes with the individual qubit readouts: joint structure, individual coin flips.', 'Check the complete state and save GHZ4Prep. Then enter the query lab.'],
      observe: 'A short repeated pattern scaled your entangled register to four qubits. Next: making a register like this answer questions.',
      checks: ['Full positive GHZ state from |0000⟩.', 'Every two-qubit interaction must be between physical neighbors.'],
      hints: ['Which neighbor has not joined the shared alternatives yet?', 'Add a controlled flip from C into the zero qubit D.', 'Use H A, CNOT A→B, B→C, and C→D. Keep the final two amplitudes at 0000 and 1111.'],
      example: {title:'Extend a shared register, not independent copies',qubits:4,inputs:[{label:'0000',initial:0}],gates:[...ghz,cx(2,3)],captions:['Begin with four zero inputs.','A has two alternatives.','B joins the correlation.','C joins the correlation.','D joins the correlation: only 0000 and 1111 remain.']}
    },
    kickback: {
      words: [
        ['oracle', 'a sealed black-box circuit computing an unknown function; you may query it'],
        ['phase kickback', 'a trick that turns the oracle’s bit-flip into a sign on YOUR qubit'],
        ['|−⟩ state', 'the minus superposition (|0⟩ − |1⟩)/√2 — the key that makes kickback work']
      ],
      goal: 'Use one oracle query to tell whether an unknown one-bit function is constant or balanced.',
      provided: 'A fixed two-port oracle plus X and H. The controller selects the hidden truth table f(0)f(1); your same circuit must handle all four tables.',
      build: 'Prepare A to ask both questions at once. Prepare B in the special minus state so the oracle’s answer lands as a sign. After the query, convert that sign into a readable bit on A.',
      concepts: [
        'Your first real algorithm. The setup: a sealed box (an oracle) computes some unknown one-bit function f. Writing its outputs as the pair f(0)f(1), the tables 00 and 11 are “constant” (same answer for both inputs) and 01 and 10 are “balanced” (different answers). Classically you must query the box twice — once for f(0), once for f(1) — to know which kind you have. You will do it in ONE query.',
        'The box is reversible, like everything here: it maps |A, B⟩ to |A, B⊕f(A)⟩ — it folds its answer into B with an XOR, exactly like your parity accumulator. The magic ingredient is what you feed B: prepare it in |−⟩ = (|0⟩ − |1⟩)/√2 (X then H on a zero qubit). A curious identity does the rest: flipping |−⟩ gives MINUS |−⟩. So wherever the oracle would flip B, it instead stamps a minus sign onto that alternative of A. The answer bounces back onto your qubit as phase — “phase kickback”.',
        'Now finish like mission 4: A went in as |+⟩ (asking both questions at once), picked up signs that encode f, and a final H converts the sign pattern into a definite bit — A reads 0 for constant, 1 for balanced. One query, guaranteed answer. This is the Deutsch algorithm, history’s first quantum speedup, and you have just built it from parts you understand individually.'
      ],
      note: 'One oracle call is counted even when its hidden function is the identity. The simulator expands the oracle for inspection and export, but your player circuit contains exactly one fixed query fixture.',
      experiment: ['Build the input preparation and connect both paths through the oracle.', 'Select tables 00, 11, 01, and 10. Sample the final register: A must be definite every time, while B stays 50/50.', 'Check all four tables. In State, find the minus signs doing the work.'],
      observe: 'The answer arrived by interference on A. B never carried the answer — its special |−⟩ input turned the oracle’s flip into usable phase.',
      checks: ['A=0 for constant tables and A=1 for balanced tables.', 'B must finish in |−⟩, including its relative sign.', 'Every path must traverse the original single-query oracle fixture.'],
      hints: ['Recall how H reveals a relative sign.', 'A needs H before and after the oracle. B needs the minus state before entering it.', 'A: input → H → oracle port A → H → output. B: input → X → H → oracle port B → output.'],
      example: {title:'One query reveals a function property',qubits:2,inputs:['00','11','01','10'].map(message=>({label:message,initial:0,message})),query:'deutsch'}
    },
    oracle: {
      words: [
        ['hidden string', 'three secret bits baked into the oracle’s wiring'],
        ['Bernstein–Vazirani', 'the algorithm that reads a hidden n-bit string with a single query']
      ],
      goal: 'Read a three-bit hidden register with a single coherent oracle query.',
      provided: 'A, B, C are data qubits; D is the auxiliary qubit. The fixed oracle computes D⊕(s·x mod 2), where s is a hidden three-bit secret.',
      build: 'Prepare each data qubit in |+⟩ and D in |−⟩. Query the fixed oracle once, then use interference to make the secret appear on the three data qubits.',
      concepts: [
        'The graduation exercise: the same kickback trick, scaled up. This oracle hides a three-bit secret s in its wiring — it XORs into D the parity of exactly those data qubits where s has a 1 (that is what s·x mod 2 means: a parity calculation using the secret as the guest list). Classically you would need three queries: test A alone, B alone, C alone. You get one.',
        'Run the recipe you already know. Every data qubit goes in as |+⟩ — asking all eight questions at once. D goes in as |−⟩, so each secret-selected parity flip kicks back as a minus sign across the data register. The pattern of signs IS the secret, written in phase. Final H gates on A, B, and C convert that phase pattern into plain bits: the data register reads exactly s. Every eight-way secret, one query, same circuit.',
        'This is the Bernstein–Vazirani algorithm, and notice what it is made of: superposition (mission 3), sign-vision via H (mission 4), reversible XOR accumulation (mission 13), and phase kickback (mission 15). Nothing new was needed — the course was the algorithm, disassembled. Fine print for honest bookkeeping: “one query” counts access to the box; preparation gates and the box’s own internals are separate resources.'
      ],
      note: 'Read only C B A for the secret. The complete output is D C B A; D stays in |−⟩, so two joint bitstrings share the probability. All eight secrets use the same player circuit.',
      experiment: ['Build the four complete paths around the black box.', 'Select secret 101. The final data bits C B A should read 101, while D stays 50/50.', 'Check all eight hidden registers. Then export Qiskit, or scale your ideas in Sandbox.'],
      observe: 'Preparation, one reversible query, interference, readout — a complete quantum algorithm, built gate by gate from things you can explain to a friend. That was the point all along.',
      checks: ['All eight secrets must appear on C B A.', 'The auxiliary qubit D must finish in |−⟩.', 'One fixed oracle fixture is used, and no test-dependent player gates are allowed.'],
      hints: ['Scale the previous query experiment from one data qubit to three.', 'Each data path needs H before and after the oracle. D supplies the phase-kickback state.', 'A, B, C: input → H → matching oracle port → H → output. D: input → X → H → oracle port D → output.'],
      example: {title:'A hidden parity becomes three readable bits',qubits:4,inputs:['000','001','010','011','100','101','110','111'].map(message=>({label:message,initial:0,message})),query:'bv'}
    }
  });
  const api = { lessons, primer, glossary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.FoundryLessons = lessons; root.FoundryPrimer = primer; root.FoundryGlossary = glossary; }
})(typeof window !== 'undefined' ? window : globalThis);
