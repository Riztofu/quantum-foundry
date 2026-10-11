// Original lesson content. Examples run through the same exact simulator as the game.
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
  const lessons = {
    link: {
      goal: 'Connect the input to the output without changing it.',
      provided: 'There is one input and one output. You do not need a gate.',
      build: 'Click the orange pin on the right of INPUT A. Then click the orange pin on the left of OUTPUT A.',
      concepts: [
        'A qubit is a physical system with two basis states, written |0⟩ and |1⟩. The brackets name a state; they do not mean a probability.',
        'An orange wire represents the path of one qubit between operations. The path preserves its state. A crossing does not join wires, and a quantum path cannot split to copy an unknown state.'
      ],
      note: 'Pins on a part’s left receive a qubit; pins on its right send it onward. Component position changes the drawing, not the computation.',
      experiment: ['Connect the two terminals.', 'Choose input 0, then input 1 in the test controller. The probability readout should follow your choice.', 'Click Check circuit. The test bench must pass both cases.'],
      observe: 'A working wire preserves both inputs. You have built the identity operation: the simplest quantum circuit.',
      checks: ['Input |0⟩ arrives as |0⟩, and input |1⟩ arrives as |1⟩.', 'The complete operation must also preserve coherent inputs.'],
      hints: ['This assignment is about a connection, not an operation. There are no parts to place.', 'Start with the right-hand orange pin on INPUT A.', 'Click INPUT A’s output pin, then OUTPUT A’s input pin. Press Check circuit.'],
      example: {title:'A wire preserves the state',qubits:1,inputs:bits(1),gates:[],captions:['Choose 0 or 1. With no gates, the input state is also the output state.']}
    },
    invert: {
      goal: 'Flip every 0 to 1 and every 1 to 0.',
      provided: 'The X gate and one input and output. Save your finished circuit as Inverter.',
      build: 'Choose X in Parts, then click the board to place it. Connect INPUT A through X to OUTPUT A.',
      concepts: [
        'X is a bit flip: X|0⟩ = |1⟩ and X|1⟩ = |0⟩. It changes a state rather than measuring it.',
        'Quantum gates are reversible. Two X gates undo one another. For a superposition, X exchanges the two amplitudes while preserving their signs and coherence.'
      ],
      note: 'Passing on one input is not enough. A reusable Inverter promises the same operation for every possible input.',
      experiment: ['Build a circuit containing X.', 'Choose 0 and press Step. Restart, choose 1, and press Step again.', 'Check circuit, then save your circuit in the success dialog. Its actual gates become a reusable block.'],
      observe: 'Both basis inputs swap. Your Inverter is a circuit you can open and inspect later, rather than a preset answer.',
      checks: ['Both input states must swap.', 'A complete operation check also rejects input-dependent phase errors.'],
      hints: ['Which available operation exchanges the two basis states?', 'A gate needs an incoming path and an outgoing path.', 'Connect INPUT A → X → OUTPUT A. Check circuit, then save Inverter.'],
      example: {title:'X is reversible',qubits:1,inputs:bits(1),gates:[X,X],captions:['Choose an input state.','One X swaps 0 and 1.','A second X restores the original state.']}
    },
    superposition: {
      goal: 'Turn the starting 0 into two equal quantum possibilities: 0 and 1.',
      provided: 'X and H gates. The starting input is 0.',
      build: 'Place H on the path from INPUT A to OUTPUT A. Use Step to see how it changes the state.',
      concepts: [
        'H, the Hadamard gate, takes |0⟩ to |+⟩ = (|0⟩ + |1⟩)/√2. Each amplitude is approximately +0.707. Squaring its magnitude gives a 50% measurement probability.',
        'A superposition retains a relationship between the two amplitudes. Applying H again can combine them into a definite 0. An unrecorded classical coin flip does not keep that coherent relationship.'
      ],
      note: 'The goal includes the positive relative sign. A different state can have the same 50/50 probabilities and still fail this assignment.',
      experiment: ['Build the target preparation and press Step. In State, look for two +0.707 amplitudes.', 'Press Sample output. Repeated fresh preparations should produce roughly half 0 and half 1; exact counts vary.', 'In Sandbox, try two H gates in sequence. Step after each one and see the original 0 return.'],
      observe: 'Probabilities describe measurement outcomes. Amplitudes also keep the sign information that makes later interference possible.',
      checks: ['The full output state must match |+⟩ from |0⟩, up to one overall phase.', 'Random measurement counts do not decide whether the circuit passes.'],
      hints: ['An X only swaps definite 0 and 1. Which part changes the amplitudes?', 'Try the Hadamard gate on |0⟩ and inspect State.', 'Connect INPUT A → H → OUTPUT A. Your target is two equal positive amplitudes.'],
      example: {title:'A superposition can interfere',qubits:1,inputs:[{label:'0',initial:0}],gates:[H,H],captions:['The starting state has a definite 0.','H creates two positive amplitudes: 50% for each outcome.','The second H combines the amplitudes. Outcome 1 cancels; outcome 0 is certain.']}
    },
    phase: {
      goal: 'Fill the gap so the starting 0 becomes 1.',
      provided: 'Two H gates are already on the path. Add a Z gate in the middle.',
      build: 'Connect the open pins through Z. Restart, then use Step to watch each gate.',
      concepts: [
        'Z leaves the |0⟩ amplitude alone and reverses the sign of the |1⟩ amplitude. On |+⟩, it creates |−⟩ = (|0⟩ − |1⟩)/√2.',
        'That sign change leaves the immediate probabilities at 50/50. A later H makes the alternatives interfere: |+⟩ becomes |0⟩, while |−⟩ becomes |1⟩. Relative phase can therefore change a later observable result.'
      ],
      note: 'A minus sign is not a negative probability. Probability is the squared magnitude of an amplitude, so it is always nonnegative.',
      experiment: ['Finish the middle path and press Restart.', 'Step through the first H, then your inserted operation. Compare the signed bars with the probability readout.', 'Step through the final H. The target is a certain 1. Then Check circuit.'],
      observe: 'The probability readout cannot reveal the middle sign change by itself. The final H turns that hidden difference into a measurable bit.',
      checks: ['From the supplied |0⟩ input, the final state must be |1⟩.', 'Both fixed H gates and their supplied terminal connections must stay intact.'],
      hints: ['The first H prepares equal positive amplitudes. What should happen to their relative sign?', 'Z changes one amplitude’s sign without changing its magnitude.', 'Place Z in the gap and connect H → Z → H. After the final H, the output is |1⟩.'],
      example: {title:'Same probabilities, different phase',qubits:1,inputs:[{label:'+',initial:[[r,0],[r,0]]}],gates:[Z,H],captions:['The |+⟩ state has equal positive amplitudes.','Z makes the |1⟩ amplitude negative. Both probabilities are still 50%.','H reveals the relative sign: the final result is a certain 1.']}
    },
    cnot: {
      goal: 'Flip B only when A is 1. Leave A unchanged.',
      provided: 'CNOT and the one-qubit gates. CNOT’s upper path is Control; its lower path is Target.',
      build: 'Send A through Control and B through Target. Connect each path to its matching output.',
      concepts: [
        'CNOT is a two-qubit operation. If control A is 0, target B stays the same. If A is 1, B is flipped. A is preserved in either case.',
        'The displayed bit order is B A, because A = q0 and B = q1. Thus input 01 means B=0 and A=1; it becomes 11. Input 10 has A=0 and stays 10.',
        'The control port does not measure A or copy it. On a superposition, CNOT applies its rule coherently to every term of the joint state.'
      ],
      note: 'C and T label the control and target ports. The two wires carry separate qubits; a wire crossing is not a connection.',
      experiment: ['Build the controlled operation with both complete paths.', 'Choose 00, 01, 10, and 11 in turn. Step once and read the resulting bitstring as B A.', 'Check circuit and save the passing circuit as ControlledFlip.'],
      observe: 'Only cases with A=1 flip B: 01 → 11 and 11 → 01. Those changes do not alter A.',
      checks: ['All four basis inputs must obey the control rule.', 'The complete coherent operation must match CNOT with A as control and B as target.'],
      hints: ['Treat the upper and lower CNOT pins as two separate paths.', 'A is the control, B is the target. Bitstrings display B first.', 'Connect A through C, B through T, then connect the upper output to A and the lower output to B.'],
      example: {title:'Choose a basis input · displayed as B A',qubits:2,inputs:bits(2),gates:[CX],captions:['Read the right-hand bit as control A.','CNOT changes B exactly when A=1. A stays unchanged.']}
    },
    bell: {
      goal: 'Make the two starting 0s share the same two possibilities: 00 and 11.',
      provided: 'Your ControlledFlip block and the basic gates. Save your finished circuit as BellPrep.',
      build: 'Put H on A, then send both paths through CNOT. This lets B follow A’s two possibilities.',
      concepts: [
        'The positive Bell state has equal amplitudes for 00 and 11, and zero amplitudes for 01 and 10. Fresh joint measurements always agree, while each qubit alone is 50/50.',
        'This pure joint state cannot be written as two independent single-qubit states. That is entanglement. Matching measurement bits alone would not prove it: a classical correlated mixture also agrees, but lacks the Bell state’s coherence.',
        'The State panel reports pure-state entanglement from 0 to 1. A Bell pair scores 1. This ideal simulator can inspect the entire state; one hardware shot cannot.'
      ],
      note: 'BellPrep is a preparation block with an input assumption: |00⟩. Its name does not promise a Bell pair for arbitrary inputs.',
      experiment: ['Build the preparation and step through it. Inspect the joint amplitudes after each operation.', 'At the end, only 00 and 11 should have positive amplitudes. Sample output and check that no 01 or 10 appears.', 'Check circuit and save BellPrep. You will reuse this exact construction in the final device.'],
      observe: 'A controlled operation connects the alternatives into one joint state. Positive relative phase matters as well as the matching outcomes.',
      checks: ['The complete state from |00⟩ must match the positive Bell state.', 'A 50/50 classical-looking histogram is insufficient without the correct coherent state.'],
      hints: ['How can you create two alternatives on A while B starts at 0?', 'A superposition on A followed by a controlled flip can correlate both paths.', 'Route A through H, then through CNOT’s control. Route B through the target. Connect both outputs and save BellPrep.'],
      example: {title:'From separate inputs to a joint state',qubits:2,inputs:[{label:'00',initial:0}],gates:[H,CX],captions:['Both qubits begin in 0.','H on A creates 00 and 01: B is still 0.','CNOT maps 01 to 11. The two equal positive terms form a Bell pair.']}
    },
    decode: {
      goal: 'Turn each shared pair into its own clear two-bit answer.',
      provided: 'Four shared-pair inputs, your ControlledFlip block, and the basic gates. Save your circuit as BellDecode.',
      build: 'Undo the BellPrep steps in reverse order: undo the last step first.',
      concepts: [
        'Φ+ and Φ− both have 00/11 measurement probabilities; their relative signs differ. Ψ+ and Ψ− both have 01/10 probabilities. Measuring those inputs directly cannot distinguish each plus/minus pair.',
        'The decoder changes basis before measurement. It converts the hidden correlation and phase information into two definite output bits. Reversing a sequence means undoing its last operation first.'
      ],
      note: 'The supplied inputs are already entangled states. Build the receiver only; do not prepend a new preparation block.',
      experiment: ['Build the inverse of the Bell preparation.', 'Select each Bell input and press Step. By the last operation, one bitstring should have probability 100%.', 'Check all four cases, then save BellDecode for Bob’s receiver.'],
      observe: 'Four orthogonal Bell states become four distinct basis states. The decoder makes phase information readable without trying to inspect it directly.',
      checks: ['Φ+ → 00; Φ− → 01; Ψ+ → 10; Ψ− → 11, up to overall phase.', 'The complete coherent decoding operation must also be correct.'],
      hints: ['Your preparation used two operations. Which one happened last?', 'Undo the controlled flip before undoing the Hadamard on A.', 'Route both paths through CNOT, then A through H. B goes directly to its output. Save BellDecode after checking.'],
      example: {title:'A basis change reveals the Bell label',qubits:2,inputs:bellInputs,gates:[CX,H],captions:['Choose one of the four supplied Bell states.','The controlled flip separates the correlated alternatives.','H on A turns the relative sign into a definite bit. Read the result as B A.']}
    },
    courier: {
      goal: 'Send any two-bit message using your saved BellPrep and BellDecode circuits.',
      provided: 'Your two saved circuits, Alice’s encoder, and a fixed link that sends A to Bob.',
      build: 'Put BellPrep before Alice’s encoder and BellDecode at Bob’s end. Send A through the link; B stays on its own path.',
      concepts: [
        'This is superdense coding. Alice and Bob first share an entangled pair, with A at Alice and B at Bob. That shared resource exists before the message is sent.',
        'For message cd, Alice applies Z to A when d=1, then X to A when c=1. This selects one of four Bell states. She sends only A; Bob already holds B.',
        'Bob’s decoder operates on both qubits. Its outputs are B=c and A=d, so the displayed bitstring B A matches message cd. The protocol uses one transmitted qubit plus the previously shared entangled pair.'
      ],
      note: 'No information is sent just by creating entanglement. Bob must receive A and jointly decode the two qubits to recover the message.',
      experiment: ['Wire your two saved blocks around the supplied encoder and send link. Keep B on its separate path.', 'Choose 00, 01, 10, and 11 as Alice’s message. Step through each message, then sample the final output.', 'Check circuit. All four messages and both saved-component requirements must pass.'],
      observe: 'The visible final bits reproduce every message. Your earlier solutions are now working parts of a larger device.',
      checks: ['Each message cd must arrive as output B A = cd.', 'Both an actual saved BellPrep and an actual saved BellDecode must be present.', 'The fixed encoding and transfer fixtures stay in the circuit.'],
      hints: ['The final device connects your earlier circuits rather than adding new primitive gates.', 'A visits Alice and then Bob. B is already held by Bob and bypasses Alice’s encoder.', 'A: input → BellPrep → encoder → SEND A → BellDecode → output. B: input → BellPrep → BellDecode → output.'],
      example: {title:'Choose Alice’s message cd',qubits:2,inputs:['00','01','10','11'].map(message => ({label:message,initial:0,message})),courier:true}
    },
    sandbox: {
      goal: 'Build and explore your own circuits on one to six qubits.',
      provided: 'The basic gates and your saved blocks. Sandbox has no pass-or-fail test.',
      build: 'Connect every input to its matching output. Add gates where you like, or use a direct wire.',
      concepts: ['The same simulator and wiring rules apply here. Start from a basis input, build a reversible circuit, then inspect its intermediate states.', 'Compare State with Measurements. State reveals ideal signed amplitudes; sampling shows only possible output bitstrings from fresh preparations.'],
      note: 'Sandbox experiments and the Bell demo do not earn campaign progress. They are safe places to try variants.',
      experiment: ['Try two X gates or two H gates on A and a direct wire on B. Verify the original input returns.', 'Build a Bell preparation and compare its joint outcomes with H applied independently to both qubits.', 'Save a valid circuit as a custom block, or use the menu to export Qiskit Python.'],
      observe: 'A block can make a larger circuit easier to read, but its internal primitive gates still count toward cost and depth.',
      checks: ['Every qubit path must be connected, without fanout, merging, or cycles.', 'All placed parts must belong to the completed circuit.'],
      hints: ['Both input qubits need paths to their matching outputs.', 'Use Fit to recover a circuit that has moved off screen.', 'Open My components to inspect a saved block. Menu → Download backup keeps a portable copy of your work.'],
      example: {title:'Explore a two-qubit preparation',qubits:2,inputs:bits(2),gates:[H,CX],captions:['Choose a basis input, displayed as B A.','H changes A’s amplitudes.','CNOT makes B respond coherently to A. Different inputs produce different Bell states.']}
    }
  };
  const h = target => ({type:'H',target}), x = target => ({type:'X',target}), cx = (control,target) => ({type:'CX',control,target});
  const ghz = [h(0),cx(0,1),cx(1,2)];
  Object.assign(lessons, {
    swap: {
      goal: 'Swap the states on A and B using CNOT gates.',
      provided: 'Two qubit paths and CNOT gates. Save your finished circuit as Swap.',
      build: 'Use three CNOT gates. Keep each physical path connected to its own matching output.',
      concepts: ['SWAP exchanges two quantum states. Input B A = 01 must become 10, and 10 must become 01. Inputs 00 and 11 stay the same.', 'Three controlled flips implement the exchange: A→B, B→A, A→B. The middle gate reverses the control and target roles, so its upper control pin receives B.', 'A wire crossing moves the drawing. A SWAP changes which state a physical qubit holds. The coherent operation check verifies that superpositions are exchanged correctly too.'],
      note: 'Swapping states is reversible. Two complete Swap blocks restore both inputs. The block still costs three CNOT operations.',
      experiment: ['Build your candidate and choose input 01.', 'Step through the controlled flips. Watch 01 become 11, then 10, then remain 10.', 'Check all inputs and save Swap. The next mission will use your circuit to route information.'],
      observe: 'A and B keep their physical identities while their states exchange. You have built a routing primitive from simpler parts.',
      checks: ['00→00, 01→10, 10→01, 11→11.', 'One coherent operation must match SWAP for every input.'],
      hints: ['A terminal crossing cannot implement a state exchange.', 'Try alternating which qubit controls the flip.', 'Use CNOT A→B, then B→A, then A→B. On the middle gate, route B through CONTROL and A through TARGET.'],
      example: {title:'Exchange without renaming the wires',qubits:2,inputs:bits(2),gates:[cx(0,1),cx(1,0),cx(0,1)],captions:['Choose a B A input.','A controls a flip of B.','B now controls a flip of A.','A controls the final flip. The two original states have exchanged.']}
    },
    routing: {
      goal: 'Make A flip C while leaving A and B as they started.',
      provided: 'Three paths, CNOT, and your saved Swap. Only A–B and B–C links are allowed.',
      build: 'Use Swap to move A next to C. Flip C, then use Swap again to put the paths back. Use your saved Swap block.',
      concepts: ['Real devices often connect only certain pairs of physical qubits. This assignment models a line: A—B—C. A direct A→C CNOT violates that connection rule.', 'A SWAP on A and B moves A’s logical state into physical B. A CNOT B→C can now act on C. Swapping A and B back restores their original state locations.', 'Restoring B matters for every possible input, including a superposition. Treat the middle qubit as useful data rather than disposable space.'],
      note: 'Adjacency is checked after expanding every saved block. Packaging a forbidden interaction cannot hide it from the hardware check.',
      experiment: ['Place your Swap and route the three complete paths.', 'Try inputs 001 and 011, displayed as C B A. C must flip when A=1, while B keeps its original value.', 'Check all eight inputs. Inspect the expanded gate cost: two three-gate swaps and one CNOT use seven gates.'],
      observe: 'You implemented a logical long-range operation using only neighboring interactions. Routing changes the cost of a quantum computation.',
      checks: ['C changes to C⊕A; A and B are preserved on all eight inputs.', 'The full coherent operation must match CNOT A→C.', 'Use a saved Swap and only neighboring interactions.'],
      hints: ['Where can A’s state move so that it neighbors C?', 'Restore the state locations after the middle controlled flip.', 'Apply Swap A↔B, CNOT B→C, then Swap A↔B. Keep C on its own path through the middle gate.'],
      example: {title:'Neighboring operations reach across a register',qubits:3,inputs:[{label:'001',initial:1},{label:'011',initial:3},{label:'010',initial:2}],gates:[{type:'SWAP',control:0,target:1},cx(1,2),{type:'SWAP',control:0,target:1}],captions:['Read C B A. A is the rightmost bit.','Swap moves A’s state into physical B.','B now holds the control state and flips neighboring C.','Swap back. B is restored, and C reflects the original A.']}
    },
    ghz: {
      goal: 'Link three starting 0s so the only possibilities are 000 and 111.',
      provided: 'Three 0 inputs and the basic gates. Only neighboring paths can connect through CNOT.',
      build: 'Put H on A, then use CNOT to link A to B and B to C. Connect all three paths to their outputs.',
      concepts: ['The GHZ state is (|000⟩ + |111⟩)/√2. A joint measurement produces all zeros or all ones; individual qubits each look 50/50.', 'H on A creates two alternatives. A→B correlates B with A. B→C extends those same alternatives across the register.', 'Three independent H gates produce eight possible bitstrings. A classical mixture of 000 and 111 also differs from this pure coherent state: it lacks the relative phase that a decoder can recover.'],
      note: 'This preparation block promises the target only from |000⟩. Its gates remain reversible on every input, but its preparation label includes that input assumption.',
      experiment: ['Build the preparation and Step after each operation.', 'Watch two alternatives expand from 000/001 to 000/011 and finally 000/111.', 'Sample output, then Check circuit and save GHZPrep.'],
      observe: 'You extended a shared pair into a shared register. The full-state check includes the sign connecting the two alternatives.',
      checks: ['The entire output state must match positive GHZ from |000⟩.', 'Neighboring interactions are required, including inside blocks.'],
      hints: ['Independent superpositions create too many alternatives.', 'Extend the Bell preparation along the line of neighbors.', 'Use H A, CNOT A→B, then CNOT B→C. Connect every unused segment as a direct path.'],
      example: {title:'One coherent alternative spreads through the register',qubits:3,inputs:[{label:'000',initial:0}],gates:ghz,captions:['All three qubits start at 0.','H on A creates 000 and 001.','A→B correlates the first two qubits: 000 and 011.','B→C creates the three-qubit GHZ state: 000 and 111.']}
    },
    uncompute: {
      goal: 'Undo the prepared three-path circuit and recover its starting bits.',
      provided: 'Each input has already passed through H, then CNOT A→B, then CNOT B→C. Build the undo steps only.',
      build: 'Undo the last step first: CNOT B→C, then CNOT A→B, then H on A. Save your circuit as GHZDecode.',
      concepts: ['For a sequence U₃U₂U₁, the inverse applies U₃’s inverse first, then U₂’s inverse, then U₁’s inverse. Simply repeating the original order generally does not undo the computation.', 'H and CNOT are each their own inverse. Here the reversal is B→C, A→B, then H A.', 'Uncomputation can restore workspace after a reversible calculation. This task checks the entire inverse operation, so a circuit that only resets one supplied state does not earn a decoder contract.'],
      note: 'The test controller labels the original input that was prepared. The displayed intermediate amplitudes are the supplied joint state, not that original basis state.',
      experiment: ['Build the decoder and choose Prepared 000.', 'Step until the entangled state returns to a definite 000.', 'Choose another prepared input, then check all eight cases and save GHZDecode.'],
      observe: 'Coherent information has been returned to the original register basis. You can build a machine and its inverse from the same parts.',
      checks: ['Every supplied preparation must return its corresponding original basis input.', 'The complete operation must match the inverse preparation coherently.'],
      hints: ['Which operation happened last in the preparation?', 'Undo B→C before undoing A→B.', 'Use CNOT B→C, CNOT A→B, then H A. Do not add another preparation at the input.'],
      example: {title:'Reverse the machine in reverse order',qubits:3,inputs:bits(3),prepare:ghz,gates:[cx(1,2),cx(0,1),h(0)],captions:['The selected basis input has already been prepared.','Undo the last correlation, B→C.','Undo the first correlation, A→B.','Undo H on A. The original register input returns.']}
    },
    parity: {
      goal: 'Flip D once for each 1 on A, B, and C. Keep A, B, and C unchanged.',
      provided: 'Four paths and reversible gates. Any two paths may connect in this puzzle.',
      build: 'Send A, B, and C through three CNOT controls that share D as the target.',
      concepts: ['Parity records whether a group contains an odd number of ones. XOR, written ⊕, is addition modulo two: 1⊕1=0.', 'The contract is D′=D⊕A⊕B⊕C. CNOT from each data qubit into D computes this reversibly without changing A, B, or C.', 'The initial D can be either 0 or 1. Overwriting it would lose information; accumulating into it keeps the complete operation reversible. Coherent inputs are transformed by the same rule.'],
      note: 'Bitstrings read D C B A. All sixteen basis inputs are tested, and the operation check also verifies coherence.',
      experiment: ['Build the accumulator. Select 0111: three data ones should toggle D to 1, giving 1111.', 'Select 0011: two data ones should leave D at 0.', 'Check all inputs and save your four-port Parity block. Inspect its original schematic in My components.'],
      observe: 'A small repeated primitive becomes a useful register-level component. You can package more than two ports without hiding its actual cost.',
      checks: ['All sixteen inputs must implement D⊕A⊕B⊕C.', 'A, B, and C must remain unchanged.', 'The coherent operation must match the reversible parity accumulator.'],
      hints: ['A controlled flip adds one input bit into the target modulo two.', 'All three controls should affect the same accumulator qubit.', 'Route D through three targets: CNOT A→D, B→D, then C→D. Return A, B, and C to their matching outputs.'],
      example: {title:'Each control adds one bit modulo two',qubits:4,inputs:[{label:'0111',initial:7},{label:'0011',initial:3},{label:'1001',initial:9}],gates:[cx(0,3),cx(1,3),cx(2,3)],captions:['Read D C B A. D is the leftmost bit.','A toggles D when A=1.','B adds its bit to D by another conditional toggle.','C adds its bit. The three data qubits are preserved.']}
    },
    fanout: {
      goal: 'Link four starting 0s so the only possibilities are 0000 and 1111.',
      provided: 'Four 0 inputs and the basic gates. Only neighboring paths can connect through CNOT.',
      build: 'Continue the three-path pattern: H on A, then CNOT A→B, B→C, and C→D. Connect every path to its output.',
      concepts: ['A four-qubit GHZ state has two nonzero amplitudes among sixteen possible basis outcomes. The joint register therefore reveals correlations that individual 50/50 readouts cannot describe.', 'The construction begins with H on A, then follows the line with A→B, B→C, and C→D.', 'This is not a copier for unknown quantum states. CNOT correlates basis alternatives with zero inputs; a superposition generally becomes entangled rather than becoming four independent copies.'],
      note: 'The register view shows every joint amplitude. The slim controller shows the most likely outcomes and each qubit’s marginal probability.',
      experiment: ['Build the preparation and Step along the line.', 'Compare the two nonzero joint outcomes with the individual qubit readouts.', 'Check the complete state and save GHZ4Prep. Then enter the query lab.'],
      observe: 'Your workspace now supports a multi-qubit circuit assembled from a short repeated pattern.',
      checks: ['Full positive GHZ state from |0000⟩.', 'Every two-qubit interaction must be between physical neighbors.'],
      hints: ['Which neighbor has not joined the shared alternatives yet?', 'Add a controlled flip from C into the zero qubit D.', 'Use H A, CNOT A→B, B→C, and C→D. Keep the final two amplitudes at 0000 and 1111.'],
      example: {title:'Extend a shared register, not independent copies',qubits:4,inputs:[{label:'0000',initial:0}],gates:[...ghz,cx(2,3)],captions:['Begin with four zero inputs.','A has two alternatives.','B joins the correlation.','C joins the correlation.','D joins the correlation: only 0000 and 1111 remain.']}
    },
    kickback: {
      goal: 'Use one query to tell whether a hidden rule always gives the same answer or changes its answer.',
      provided: 'A two-path oracle and X and H gates. The hidden rule changes for each test, so keep the same circuit.',
      build: 'Use H before and after the oracle on A. On B, use X then H before the oracle. Connect both complete paths.',
      concepts: ['The oracle is a reversible function: |A,B⟩ becomes |A,B⊕f(A)⟩. Tables 00 and 11 are constant; 01 and 10 are balanced.', 'Prepare B in |−⟩ by applying X then H to |0⟩. Because X|−⟩=−|−⟩, an oracle flip contributes a sign to the corresponding A alternative. This is phase kickback.', 'With A initially in |+⟩, a final H turns a constant function into A=0 and a balanced function into A=1. B remains |−⟩. This is the Deutsch algorithm in the ideal query model.'],
      note: 'One oracle call is counted even when its hidden function is the identity. The simulator expands the oracle for inspection and export, but your player circuit contains exactly one fixed query fixture.',
      experiment: ['Build the input preparation and connect both paths through the oracle.', 'Select tables 00, 11, 01, and 10. Sample the final register: A must be definite while B stays 50/50.', 'Check all four tables. In State, inspect the relative sign carried by B.'],
      observe: 'The answer is encoded in interference on A. B is an auxiliary qubit whose special input converts a reversible bit flip into phase information.',
      checks: ['A=0 for constant tables and A=1 for balanced tables.', 'B must finish in |−⟩, including its relative sign.', 'Every path must traverse the original single-query oracle fixture.'],
      hints: ['Recall how H reveals a relative sign.', 'A needs H before and after the oracle. B needs the minus state before entering it.', 'A: input → H → oracle port A → H → output. B: input → X → H → oracle port B → output.'],
      example: {title:'One query reveals a function property',qubits:2,inputs:['00','11','01','10'].map(message=>({label:message,initial:0,message})),query:'deutsch'}
    },
    oracle: {
      goal: 'Find a hidden three-bit number using one oracle query.',
      provided: 'A, B, and C hold the answer bits. D is a helper path used by the oracle.',
      build: 'Put H on A, B, and C before and after the oracle. Put X then H on D before it. Connect all four paths.',
      concepts: ['The oracle uses the hidden bits as controls in a parity calculation: s·x=sA·A⊕sB·B⊕sC·C. D accumulates that result reversibly.', 'Putting D in |−⟩ makes the parity calculation contribute the phase (−1)^(s·x) to the data register. Applying H to A, B, and C then reveals the secret as a definite bitstring.', 'This is the Bernstein–Vazirani algorithm. The one-query statement refers to access to the supplied oracle; the preparation, final gates, and physical cost of implementing that oracle are separate resources.'],
      note: 'Read only C B A for the secret. The complete output is D C B A; D stays in |−⟩, so two joint bitstrings share the probability. All eight secrets use the same player circuit.',
      experiment: ['Build the four complete paths around the black box.', 'Select secret 101. The final data bits C B A should be 101, while D is 50/50.', 'Check all eight hidden registers. Export Qiskit or continue with one to six qubits in Sandbox.'],
      observe: 'You combined preparation, reversible parity, phase kickback, and interference into a small quantum algorithm. The circuit is executable, inspectable, and built from the gates you learned.',
      checks: ['All eight secrets must appear on C B A.', 'The auxiliary qubit D must finish in |−⟩.', 'One fixed oracle fixture is used, and no test-dependent player gates are allowed.'],
      hints: ['Scale the previous query experiment from one data qubit to three.', 'Each data path needs H before and after the oracle. D supplies the phase-kickback state.', 'A, B, C: input → H → matching oracle port → H → output. D: input → X → H → oracle port D → output.'],
      example: {title:'A hidden parity becomes three readable bits',qubits:4,inputs:['000','001','010','011','100','101','110','111'].map(message=>({label:message,initial:0,message})),query:'bv'}
    }
  });
  Object.assign(lessons.sandbox, {
    goal:'Build and inspect your own circuits on a register of one to six qubits.',
    provided:'X, H, Z, CNOT, SWAP, and saved blocks that fit your register. Use Register above the board to switch sizes; each size keeps its own circuit.',
    build:'Complete every input-to-output path. Unused qubits can take direct wires. Blocks can have up to six ports, and the board accepts 160 parts.',
    concepts:['A wire sends a qubit from one part to the next. A gate changes it. Every input must reach its matching output.','State shows the simulator’s full answer. Sample output shows one possible readout from a fresh run. Repeating a sample can give different results.'],
    note:'Each register size keeps its own Sandbox circuit. Experiments here do not change your campaign progress. Download a backup to keep or move your work.',
    experiment:['Try two X gates on A, or two H gates. Step through them and watch the starting state return.','Build a Bell pair with H then CNOT. Compare it with using H on both paths by themselves.','Save your circuit as a block, or choose Export to Qiskit in the menu.'],
    observe:'Saved blocks help organize a large circuit. Their gates still count as part of the circuit.',
    checks:['Connect every input to its matching output.','Do not split a path or connect two inputs together.'],
    hints:['Give every input its own path to the matching output.','Use Register to change the number of paths, then Fit to see the whole circuit.','Save a finished circuit as a block. Download backup keeps your work safe.']
  });
  if (typeof module === 'object' && module.exports) module.exports = lessons;
  else root.FoundryLessons = lessons;
})(typeof window !== 'undefined' ? window : globalThis);
