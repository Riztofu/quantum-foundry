# Quantum Foundry — solutions and demo script

These are spoilers. Gates may be placed anywhere; wiring determines behavior.

## Campaign solutions

1. **First Connection:** INPUT A → OUTPUT A.
2. **The Inverter:** INPUT A → X → OUTPUT A. Check circuit, then save Inverter.
3. **Two Possibilities:** INPUT A → H → OUTPUT A. Check circuit. Sample output illustrates equal measurement probabilities.
4. **The Hidden Sign:** connect the first fixed H → Z → the final fixed H. The input and output fixture wires are already supplied. Restart execution and step twice to see the negative amplitude; step once more to see |1⟩.
5. **Conditional Flip:** INPUT A → CNOT CONTROL → OUTPUT A. INPUT B → CNOT TARGET → OUTPUT B. Check circuit, then save ControlledFlip.
6. **A Shared Pair:** INPUT A → H → ControlledFlip CONTROL → OUTPUT A. INPUT B → ControlledFlip TARGET → OUTPUT B. You can also use primitive CNOT. Check circuit, then save BellPrep.
7. **Read the Bell State:** INPUT A → ControlledFlip CONTROL → H → OUTPUT A. INPUT B → ControlledFlip TARGET → OUTPUT B. Check circuit verifies all four supplied states and the full operation. Save BellDecode.
8. **Quantum Courier:** place your saved BellPrep to the left of ENCODE, and BellDecode at Bob's receiver. A: INPUT A → BellPrep A → ENCODE → SEND A → BellDecode A → OUTPUT A. B: INPUT B → BellPrep B → BellDecode B → OUTPUT B. ENCODE → SEND A is fixed. Check circuit tests messages 00, 01, 10, and 11, plus reuse of both blocks.

CNOT's upper ports are control, lower ports target. Saved two-qubit blocks' upper ports are local A, lower ports local B. A wire crossing is not a junction. Bitstrings display B A, so a two-bit message's left bit comes out on B and right bit on A.

## Two-to-three-minute presentation

Prepare the completed campaign circuits beforehand in this browser, and use Menu → Download backup.

- **0:00–0:20:** show the campaign map. Explain that each solved circuit becomes a reusable component.
- **0:20–0:50:** reopen The Hidden Sign. Restart, step through H and Z, and show the negative amplitude. The final H converts the sign difference into output 1.
- **0:50–1:25:** reopen A Shared Pair. Show H and ControlledFlip, then Check circuit. Inspect BellPrep in the component workshop to show it contains the actual saved schematic.
- **1:25–2:20:** reopen Quantum Courier. Show the reused preparation and decoder blocks. Choose 11, Sample output, and show the recovered 11. Check circuit verifies all four messages.
- **2:20–2:45:** use Menu → Export to Qiskit. Explain the resource: one transmitted qubit and an entangled pair shared beforehand. The optional local IonQ service can submit one selected input to a physical QPU; those noisy samples do not verify every input.

For an immediate short preview without campaign preparation, Bell Demo opens a populated Bell circuit in Sandbox and does not grant progress.

## Chapter II solutions

9. **Exchange the States:** CNOT A→B, then CNOT B→A, then CNOT A→B. On the middle gate, connect B to the upper CONTROL and A to the lower TARGET. Return each physical path to its matching output. Save **Swap**.
10. **Across the Register:** your saved Swap on A↔B, then CNOT B→C, then your saved Swap on A↔B again. C bypasses the Swap blocks. The middle qubit's original state is restored; the net operation is CNOT A→C. Every expanded interaction is between neighbors. The cost is seven CNOTs.
11. **A Three-Way Link:** H A, CNOT A→B, CNOT B→C. Save **GHZPrep**. Expected amplitudes: +0.707 at 000 and 111.
12. **Undo the Machine:** CNOT B→C, CNOT A→B, H A. Do not add a preparation: the test input is already prepared. Save **GHZDecode**.
13. **Parity Accumulator:** CNOT A→D, B→D, C→D. A/B/C keep their values; D accumulates all three by XOR. Route the same D path through all three target pins. Save **Parity**.
14. **A Four-Way Link:** H A, CNOT A→B, B→C, C→D. Save **GHZ4Prep**. Expected amplitudes: +0.707 at 0000 and 1111.
15. **One Quantum Query:** A: input → H → oracle port A → H → output. B: input → X → H → oracle port B → output. A reads 0 for constant tables 00/11 and 1 for balanced tables 01/10. B remains in the minus state; the whole state can have an irrelevant overall sign.
16. **The Hidden Register:** A/B/C each follow input → H → matching oracle port → H → output. D follows input → X → H → oracle port D → output. Secret s appears on C B A. For secret 101, joint outcomes are 0101 and 1101, each 50%, with opposite amplitude signs. One oracle query is made for every secret.

Saved blocks label ports from local A at the top through their remaining qubits. Connect a block's local ports to the physical qubits needed for its operation. A physical qubit still returns to its matching output terminal after a SWAP.

## Expanded three-minute presentation

Prepare a completed project and keep its JSON backup before presenting. Turn music down in the menu for narration. Each entry opens a briefing: click Build circuit when ready to show the board.

- **0:00–0:20:** show both map chapters: small gates become your own blocks, then larger registers and algorithms.
- **0:20–0:50:** step through The Hidden Sign. A phase change preserves immediate probabilities, then changes the result after H.
- **0:50–1:20:** open Across the Register. Inspect your saved Swap, then show the seven-gate neighboring implementation and preserved middle qubit.
- **1:20–1:50:** open A Four-Way Link. Step through the register and sample 0000/1111. Distinguish joint outcomes from single-qubit 50/50 readouts.
- **1:50–2:40:** open The Hidden Register. Choose 101, show the two joint outcomes, and explain that C B A contains the secret while D stays in the minus state. Check all eight secrets.
- **2:40–3:00:** export the selected circuit to Qiskit. If the local IonQ service is configured, demonstrate one selected input on the QPU and explain that hardware sampling is noisy and complements the exact game check.
