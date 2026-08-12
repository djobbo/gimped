### Task 9: Workspace verification

**Files:** none new (fix only)

- [ ] **Step 1: Run package tests**

```bash
pnpm -r test
```

Expected: all PASS.

- [ ] **Step 2: Run check if configured**

```bash
pnpm check
```

Expected: PASS or fix only issues introduced by this work.

- [ ] **Step 3: Confirm success criteria from spec**

1. Vite+ monorepo at root with both packages
2. Decompile/compile with key `762411009`
3. Entry-equal round-trip
4. `--json` registry round-trip
5. `--version latest` → `10090` / `762411009`

---
