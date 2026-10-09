# Shift, reduce, accept

An LR parser built in front of us from any grammar we type, then compared with a real GNU Bison parser.

## What it covers

1. **Why bottom-up**: shift, reduce, accept, and rightmost derivations in reverse.
2. **Grammar lab**: one grammar drives every frame, with presets (expression grammar, dangling else, an SLR-but-not-LALR failure, ε-productions, right-associative power).
3. **FIRST and FOLLOW** for the augmented grammar.
4. **LR(0) items**: CLOSURE, GOTO and the canonical collection as clickable state cards.
5. **The SLR table**: ACTION and GOTO, with conflicts highlighted.
6. **Run the parser**: stack, input tape, the live table cell and state, a move log and a parse tree that grows bottom-up.
7. **Inside real Bison**: `expr.y`, `expr.output`, the `yyparse` skeleton, and a real `yydebug` trace showing default reductions.
8. **Conflicts**: the dangling else with Bison's counterexample, precedence declarations, and why LALR handles `S → L = R | R` when SLR cannot.
9. **Quizzes, exercises and a reading list.**

## Verification

`node verify/check-dragon-book.js` checks every ACTION and GOTO cell against Fig. 4.37, the moves against Fig. 4.38, the conflicts the page teaches, and (if installed) GNU Bison's own conflict reports. `lr-engine.js` reproduces the Dragon Book's (2nd ed.) twelve states, SLR table (Fig. 4.37) and moves for `id * id + id` (Fig. 4.38). All Bison output on the page comes from GNU Bison 3.8.2.
