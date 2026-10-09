# One core, two ways to wait

A root-to-end companion to our CSE321 (Operating Systems) Theory Assignment 01, *A Comparative Analysis of Multi-Threading and Event-Driven Concurrency*. The report compares the two models at the level of ideas; this page traces both down to the kernel code they are built on.

## The assignment

- [Our submitted report (PDF)](assignment/CSE321_Theory_Assignment_01_Report.pdf)

## What it covers

1. **The common root**: a thread blocked in `read()` (`sk_wait_data`) and an event loop blocked in `epoll_wait()` (`ep_poll`) both sleep the same way and call `schedule()`.
2. **Two echo servers**: the same server written thread-per-connection and with epoll.
3. **What a thread is**: the `clone` flags in glibc's `create_thread()`.
4. **The context switch**: `context_switch()` in `kernel/sched/core.c`, with `switch_mm_irqs_off` and `switch_to`.
5. **Races and mutexes**: glibc's futex lock (`__lll_lock`, `__lll_lock_wait`), plus a step-through race simulator where we act as the scheduler.
6. **How the loop is woken**: `ep_poll_callback` and libuv's `uv__io_poll`.
7. **One-core timeline simulator**: the same requests through both models (I/O-bound, CPU-bound, head-of-line blocking).
8. **Scale model**: what 10,000 connections cost in each model.
9. **Precision notes** on a few lines of the report (EEVDF vs CFS, PCB vs `task_struct`, PCID, logical races across `await`, libuv's thread pool for files).
10. **Exercises** to verify everything with `strace`, `/proc`, `pmap` and `perf`.

## Sources

Linux (GPL-2.0), glibc (LGPL-2.1+) and libuv (MIT) source, fetched October 2026. Links to each original file are at the bottom of the page. The simulator is a teaching model with stated assumptions, not a benchmark.
