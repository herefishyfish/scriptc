/* The ask-4 reference corpus (§3 of the reference package), ported to
 * scriptc's IR as hand-built modules — the fast pin on the inference
 * itself (domain, transfer semantics, branch refinement, widening). The
 * same sixteen programs run end-to-end through compileLibrary as
 * library-mode fixtures in tests/harness/library-int.test.ts; this file
 * is the millisecond-scale twin that points at the analysis when the two
 * disagree.
 *
 * The corpus convention maps onto scriptc as declared integer PARAMETER
 * slots: `send(x)` is a call whose callee's first parameter the config
 * declares i64 (slot path Msg.count), `sendU64(x)` u64 (Msg.id). */
import { describe, expect, test } from "vitest";
import type { IrExpr, IrFunction, IrModule, IrNumBinOp, IrStmt } from "../ir/nodes.js";
import {
  checkLibraryIntegerSlots,
  type IntSlotConfig,
  type IntVerdict,
  SAFE_MAX,
  SAFE_MIN,
} from "./int-infer.js";

const loc = { file: "corpus.ts", start: 0, end: 0 };
const F64 = { kind: "f64" } as const;
const BOOL = { kind: "bool" } as const;
const VOID = { kind: "void" } as const;

const num = (value: number, spelling?: string): IrExpr =>
  spelling === undefined
    ? { kind: "numLit", value, type: F64, loc }
    : { kind: "numLit", value, spelling, type: F64, loc };
const ref = (localId: string): IrExpr => ({ kind: "varRef", localId, type: F64, loc });
const bin = (op: IrNumBinOp, left: IrExpr, right: IrExpr): IrExpr => ({
  kind: "bin", op, left, right, type: op === "<" || op === "<=" || op === ">" || op === ">=" || op === "===" || op === "!==" ? BOOL : F64, loc,
});
const and = (left: IrExpr, right: IrExpr): IrExpr => ({ kind: "logical", op: "&&", left, right, type: BOOL, loc });
const math = (fn: string, ...args: IrExpr[]): IrExpr => ({ kind: "libCall", fn: `math.${fn}`, args, type: F64, loc } as IrExpr);
const send = (value: IrExpr, callee = "send"): IrStmt => ({
  kind: "exprStmt",
  expr: { kind: "call", callee, args: [value], type: VOID, loc },
  loc,
});
const decl = (localId: string, init: IrExpr): IrStmt => ({ kind: "varDecl", localId, init, loc });
const assign = (localId: string, value: IrExpr): IrStmt => ({ kind: "assign", localId, value, loc });
const iff = (cond: IrExpr, then: IrStmt[]): IrStmt => ({ kind: "if", cond, then, else_: null, loc });
const forLoop = (init: IrStmt, cond: IrExpr, update: IrStmt, body: IrStmt[]): IrStmt => ({
  kind: "for", init, cond, update, body, loc,
});

const sink = (name: string): IrFunction => ({
  name,
  params: [{ localId: "x.0", name: "x", type: F64 }],
  returnType: VOID,
  locals: [{ id: "x.0", name: "x", type: F64, mutable: true }],
  body: [],
  loc,
});

/** A module holding the case function plus the two declared sinks. */
function caseModule(params: string[], locals: string[], body: IrStmt[]): IrModule {
  return {
    irVersion: 3,
    sourceFile: "corpus.ts",
    functions: [
      sink("send"),
      sink("sendU64"),
      {
        name: "case",
        params: params.map((p) => ({ localId: `${p}.0`, name: p, type: F64 })),
        returnType: VOID,
        locals: [...params, ...locals].map((p) => ({ id: `${p}.0`, name: p, type: F64, mutable: true })),
        body,
        loc,
      },
    ],
    entry: "case",
  };
}

const CFG: IntSlotConfig = {
  fns: new Map([
    ["send", { fnName: "send", params: ["i64"], paramPaths: ["Msg.count"], ret: null, retPath: null, paramSeeds: [null] }],
    ["sendU64", { fnName: "sendU64", params: ["u64"], paramPaths: ["Msg.id"], ret: null, retPath: null, paramSeeds: [null] }],
  ]),
  records: new Map(),
};

function verdicts(mod: IrModule): IntVerdict[] {
  return checkLibraryIntegerSlots(mod, CFG);
}

function only(mod: IrModule): IntVerdict {
  const vs = verdicts(mod);
  expect(vs.length).toBe(1);
  return vs[0]!;
}

describe("the ask-4 conformance corpus over scriptc IR", () => {
  test("1. max-safe-integer-exact — PROVE, crossing value 9007199254740991", () => {
    const v = only(caseModule([], [], [send(bin("-", bin("**", num(2), num(53)), num(1)))]));
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(9007199254740991);
    expect(v.provenHi).toBe(9007199254740991);
  });

  test("2. literal-not-representable — REFUSE on the SPELLING, not the rounded value", () => {
    // The frontend threads the source spelling exactly when it does not
    // round-trip; the value the program held is the nearest double.
    const v = only(caseModule([], [], [send(num(9007199254740992, "9007199254740993"))]));
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("representability");
    expect(v.detail).toContain("9007199254740993");
    expect(v.detail).toContain("9007199254740992");
  });

  test("3. proven-range-overflow — REFUSE, range (2^60 past the provable bound)", () => {
    const v = only(
      caseModule(["a"], ["t"], [
        iff(and(bin(">=", ref("a.0"), num(0)), bin("<=", ref("a.0"), num(2 ** 30))), [
          decl("t.0", math("trunc", ref("a.0"))),
          send(bin("*", ref("t.0"), ref("t.0"))),
        ]),
      ]),
    );
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("range");
  });

  test("4. negative-zero-crosses-as-zero — PROVE, crossing value 0", () => {
    const v = only(caseModule([], [], [send(num(-0))]));
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(0);
    expect(Object.is(v.provenLo, 0) && !Object.is(v.provenLo, -0)).toBe(true);
  });

  test("5. times-half-unprovable — REFUSE, wholeness (range and NaN already proven)", () => {
    const v = only(
      caseModule(["a"], ["t"], [
        iff(and(bin(">=", ref("a.0"), num(0)), bin("<=", ref("a.0"), num(1000))), [
          decl("t.0", bin("*", ref("a.0"), num(0.5))),
          send(ref("t.0")),
        ]),
      ]),
    );
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("wholeness");
    expect(v.detail).toContain("non-integers"); // fractional, NOT the NaN wording
  });

  test("6. times-half-with-trunc — PROVE, crossing range [0, 500]", () => {
    const v = only(
      caseModule(["a"], ["t"], [
        iff(and(bin(">=", ref("a.0"), num(0)), bin("<=", ref("a.0"), num(1000))), [
          decl("t.0", bin("*", ref("a.0"), num(0.5))),
          send(math("trunc", ref("t.0"))),
        ]),
      ]),
    );
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(0);
    expect(v.provenHi).toBe(500);
  });

  test("7. bounded-counter-loop — PROVE precisely [0, 9] (the anti-trigger-happiness gate)", () => {
    const v = only(
      caseModule([], ["n"], [
        forLoop(decl("n.0", num(0)), bin("<", ref("n.0"), num(10)), assign("n.0", bin("+", ref("n.0"), num(1))), [
          send(ref("n.0")),
        ]),
      ]),
    );
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(0);
    expect(v.provenHi).toBe(9); // exact — a widened bound here is a failed port
  });

  test("8. division-non-integer — REFUSE, wholeness", () => {
    const v = only(caseModule([], [], [send(bin("/", num(7), num(2)))]));
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("wholeness");
  });

  test("9. remainder-negative-dividend — PROVE, crossing value -1 (JS sign rule)", () => {
    const v = only(caseModule([], [], [send(bin("%", num(-7), num(3)))]));
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(-1);
    expect(v.provenHi).toBe(-1);
  });

  test("10. bitwise-or-int32 — PROVE int32 range whatever the input (ToInt32 contract)", () => {
    const v = only(caseModule(["a"], [], [send(bin("|", ref("a.0"), num(0)))]));
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(-(2 ** 31));
    expect(v.provenHi).toBe(2 ** 31 - 1);
  });

  test("11. unsigned-shift-u64 — PROVE, uint32 fits a u64 slot", () => {
    const v = only(caseModule(["a"], [], [send(bin(">>>", ref("a.0"), num(0)), "sendU64")]));
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(0);
    expect(v.provenHi).toBe(2 ** 32 - 1);
  });

  test("12. u64-negative-proven-range — REFUSE, range (negatives cannot enter u64)", () => {
    const v = only(
      caseModule(["a"], ["t"], [
        iff(and(bin(">=", ref("a.0"), num(-100)), bin("<=", ref("a.0"), num(100))), [
          decl("t.0", math("trunc", ref("a.0"))),
          send(ref("t.0"), "sendU64"),
        ]),
      ]),
    );
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("range");
    expect(v.detail).toContain("non-negative");
  });

  test("13. conditional-range-refinement — PROVE, crossing range [2, 6]", () => {
    const v = only(
      caseModule(["a"], [], [
        iff(and(bin(">=", ref("a.0"), num(2)), bin("<=", ref("a.0"), num(6))), [
          send(math("round", ref("a.0"))),
        ]),
      ]),
    );
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(2);
    expect(v.provenHi).toBe(6);
  });

  test("14. data-dependent-loop-bound — REFUSE, range ([0, ∞) is unprovable)", () => {
    const v = only(
      caseModule(["m"], ["n"], [
        forLoop(decl("n.0", num(0)), bin("<", ref("n.0"), ref("m.0")), assign("n.0", bin("+", ref("n.0"), num(1))), [
          send(ref("n.0")),
        ]),
      ]),
    );
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("range");
  });

  test("15. nan-reaches-slot — REFUSE, wholeness (0/0 is NaN)", () => {
    const v = only(caseModule([], [], [send(bin("/", num(0), num(0)))]));
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("wholeness");
    expect(v.detail).toContain("NaN");
  });

  test("16. infinity-reaches-slot — REFUSE, range (1/0 is Infinity)", () => {
    const v = only(caseModule([], [], [send(bin("/", num(1), num(0)))]));
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("range");
    expect(v.detail).toContain("Infinity");
  });
});

describe("the domain's edges beyond the corpus", () => {
  test("a declared i64 parameter seeds whole-in-safe-range inside its own function", () => {
    // send's own body forwards its parameter to sendU64: the i64 seed is
    // whole and in ±(2^53−1), but may be negative — the u64 slot refuses
    // on range, proving the seed is neither TOP nor blindly trusted.
    const mod = caseModule([], [], []);
    (mod.functions[0]!.body as IrStmt[]).push(send(ref("x.0"), "sendU64"));
    const vs = checkLibraryIntegerSlots(mod, CFG);
    expect(vs.length).toBe(1);
    expect(vs[0]!.outcome).toBe("refuse");
    expect(vs[0]!.obligation).toBe("range");
    expect(vs[0]!.detail).toContain(`[${SAFE_MIN}, ${SAFE_MAX}]`);
  });

  test("a guard that only excludes NaN still refuses on the unbounded range", () => {
    // if (a === a) send(a) — NaN excluded, but the interval stays ±∞.
    const v = only(caseModule(["a"], [], [iff(bin("===", ref("a.0"), ref("a.0")), [send(ref("a.0"))])]));
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("range");
  });

  test("the arithmetic twin of the representability case refuses on RANGE", () => {
    // 2^53 + 1 computed arithmetically: no spelling, whole, but past the
    // provable bound — the failed obligation is range, never
    // representability (a computed value is not the author's literal).
    const v = only(caseModule([], [], [send(bin("+", bin("**", num(2), num(53)), num(1)))]));
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("range");
  });

  test("a while-loop spelling of the counter proves the same exact bound", () => {
    const v = only(
      caseModule([], ["n"], [
        decl("n.0", num(0)),
        { kind: "while", cond: bin("<", ref("n.0"), num(10)), body: [send(ref("n.0")), assign("n.0", bin("+", ref("n.0"), num(1)))], loc },
      ]),
    );
    expect(v.outcome).toBe("prove");
    expect(v.provenLo).toBe(0);
    expect(v.provenHi).toBe(9);
  });

  test("break carries its refined state out of the loop", () => {
    // for (;;) { if (n >= 5) break; send(n); n = n + 1 } send(n)
    const v = verdicts(
      caseModule([], ["n"], [
        decl("n.0", num(0)),
        {
          kind: "for", init: null, cond: null, update: null, loc,
          body: [
            iff(bin(">=", ref("n.0"), num(5)), [{ kind: "break", loc }]),
            send(ref("n.0")),
            assign("n.0", bin("+", ref("n.0"), num(1))),
          ],
        },
        send(ref("n.0")),
      ]),
    );
    expect(v.length).toBe(2);
    expect(v[0]!.outcome).toBe("prove"); // inside: [0, 4] — the fall-through edge's refinement
    expect(v[0]!.provenLo).toBe(0);
    expect(v[0]!.provenHi).toBe(4);
    // After the break: the header widened (no condition bounds it), so the
    // break edge proves [5, 2^31−1] — lo refined exactly, hi at the
    // widening threshold, still comfortably inside the slot.
    expect(v[1]!.outcome).toBe("prove");
    expect(v[1]!.provenLo).toBe(5);
    expect(v[1]!.provenHi).toBe(2 ** 31 - 1);
  });

  test("Math.min/max propagate NaN from any argument, as JS does", () => {
    const v = only(caseModule(["a"], [], [send(math("min", math("trunc", ref("a.0")), num(0)))]));
    expect(v.outcome).toBe("refuse");
    expect(v.obligation).toBe("wholeness");
    expect(v.detail).toContain("NaN");
  });
});
