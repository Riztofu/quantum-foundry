"""Backend grading tests: run with `pytest test_quantum.py`."""
from main import CaseModel, ExpectModel, OpModel, OperatorCheckModel, VerifyRequest, verify

R2 = 2 ** -0.5

H0 = OpModel(gate="H", qubits=[0])
X0 = OpModel(gate="X", qubits=[0])
Z0 = OpModel(gate="Z", qubits=[0])
CX01 = OpModel(gate="CX", qubits=[0, 1])
CX10 = OpModel(gate="CX", qubits=[1, 0])

BELL_AMPS = [[R2, 0.0], [0.0, 0.0], [0.0, 0.0], [R2, 0.0]]


def test_bell_prep_passes():
    req = VerifyRequest(
        numQubits=2,
        cases=[
            CaseModel(
                id="t0",
                inputs=[0, 0],
                ops=[H0, CX01],
                expect=ExpectModel(type="state", amps=BELL_AMPS),
            )
        ],
    )
    out = verify(req)
    assert out["allPass"], out


def test_wrong_phase_bell_fails():
    req = VerifyRequest(
        numQubits=2,
        cases=[
            CaseModel(
                id="t0",
                inputs=[0, 0],
                ops=[X0, H0, CX01],  # prepares (|00> - |11>)/sqrt2
                expect=ExpectModel(type="state", amps=BELL_AMPS),
            )
        ],
    )
    out = verify(req)
    assert not out["allPass"], out


def test_reversed_cnot_fails_operator_check():
    req = VerifyRequest(
        numQubits=2,
        cases=[
            CaseModel(
                id="t00",
                inputs=[0, 0],
                ops=[CX10],
                expect=ExpectModel(type="bits", bits="00"),
            )
        ],
        operatorCheck=OperatorCheckModel(refOps=[CX01], arity=2),
    )
    out = verify(req)
    assert out["operatorPass"] is False


def test_global_phase_equivalence_accepted():
    # X·Z = -Z·X: the composite differs from Z·X only by a global phase
    req = VerifyRequest(
        numQubits=1,
        cases=[
            CaseModel(id="t0", inputs=[0], ops=[X0, Z0], expect=ExpectModel(type="bits", bits="1")),
        ],
        operatorCheck=OperatorCheckModel(refOps=[Z0, X0], arity=1),
    )
    out = verify(req)
    assert out["operatorPass"] is True, out


def test_courier_all_messages():
    for msg, (c, d) in {"00": (0, 0), "01": (0, 1), "10": (1, 0), "11": (1, 1)}.items():
        ops = [H0, CX01]
        if c:
            ops.append(X0)
        if d:
            ops.append(Z0)
        ops += [CX01, H0]
        req = VerifyRequest(
            numQubits=2,
            cases=[CaseModel(id=msg, inputs=[0, 0], ops=ops, expect=ExpectModel(type="bits", bits=msg))],
        )
        out = verify(req)
        assert out["allPass"], (msg, out)


def test_bell_decoder_cases_and_operator():
    decode = [CX01, H0]
    preps = {
        "00": [H0, CX01],
        "10": [H0, CX01, X0],
        "01": [H0, CX01, Z0],
        "11": [H0, CX01, X0, Z0],
    }
    cases = [
        CaseModel(id=bits, inputs=[0, 0], prep=prep, ops=decode, expect=ExpectModel(type="bits", bits=bits))
        for bits, prep in preps.items()
    ]
    req = VerifyRequest(numQubits=2, cases=cases, operatorCheck=OperatorCheckModel(refOps=decode, arity=2))
    out = verify(req)
    assert out["allPass"], out


def test_incomplete_circuit_reported():
    req = VerifyRequest(
        numQubits=1,
        cases=[CaseModel(id="t0", inputs=[0], ops=None, expect=ExpectModel(type="bits", bits="0"))],
    )
    out = verify(req)
    assert not out["allPass"]
    assert "incomplete" in out["summary"]
