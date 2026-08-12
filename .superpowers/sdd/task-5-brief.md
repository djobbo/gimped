### Task 5: Full suite verification

**Files:** none expected beyond fixes if something fails

- [ ] **Step 1: Run full package tests**

```bash
pnpm --filter @gimped/swz exec vp test
pnpm --filter @gimped/swz-cli exec vp test
```

Expected: all PASS

- [ ] **Step 2: Run check if normally used**

```bash
pnpm check
```

Expected: PASS (or fix any type errors from widened channels)

- [ ] **Step 3: Commit only if fixes were needed**

```bash
git add -u
git commit -m "fix(swz): finish structured JSON transpile type/test fallout"
```

Skip this commit if the tree is clean.
