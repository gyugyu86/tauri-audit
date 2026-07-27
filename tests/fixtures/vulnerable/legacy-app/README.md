# legacy-app — deliberately insecure v1 sample

Not a real application. The companion to `demo-app`, which is v2: this one is Tauri v1, so a
scan of the parent directory exercises both configuration generations at once.

Its specific job is to produce **one rule reporting at two different confidences in a single
scan**. `dangerousRemoteDomainIpcAccess` below holds two entries: one granting
`enableTauriAPI`, which is high confidence, and one naming only a domain and windows, which
is heuristic. Both come from TA-V1-002.

That combination is what makes the code-scanning rendering checkable. SARIF puts
`security-severity` on the rule while `level` is per-result, so a mixed rule is the only case
where a heuristic alert inherits a confident rule's band — and the only way to see whether
`level` and the `[heuristic]` prefix are enough to tell them apart.

Nothing here should be copied into a real application.
