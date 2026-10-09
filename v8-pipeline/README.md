# How V8 turns `a + b` into machine code

A root-to-end trace of one JavaScript expression through V8, the engine inside Chrome and Node.js.

## What it covers

1. **Handoff**: where Blink gives source text to V8.
2. **Expression lab**: type an expression over `a`, `b`, `c` and every frame below updates.
3. **Scanner**: tokens, with the `one_char_tokens` fast path.
4. **Parser**: precedence climbing (`ParseBinaryContinuation`) with an AST diagram, parser trace, constant folding and n-ary collapsing.
5. **Bytecode generator**: Ignition bytecode with registers, feedback slots, Smi-immediate forms and `.Wide` operands.
6. **Ignition stepper**: run the bytecode on an accumulator machine, for our expression or the real `sumSquares` bytecode.
7. **Hidden classes and inline caches**: map transitions and the monomorphic → polymorphic → megamorphic states.
8. **Tiers**: Ignition → Sparkplug → Maglev → TurboFan, with Node and Chrome defaults.
9. **Deoptimization**: a replay of real `--trace-opt --trace-deopt` output.
10. **Quizzes, exercises and a reading list.**

## Verification

`v8-model.js` reproduces the bytecode that Node 22's V8 prints with `--print-bytecode`. Check it on random expressions:

```
node verify/compare-with-node.js 300 42
```

## Sources

V8 source (BSD license) and real output from Node.js 22, captured October 2026.
