# Changes

## 0.15.13-omp.1 — unreleased

### Upstream synchronization

- Apply upstream executable-mode changes even when file contents are unchanged, including same-revision mode repair.
- Preserve existing read/write permissions and deliberately local modes on adapted files; mode-only updates do not rewrite unchanged read-only content.
- Reconstruct the same applicable mode during reviewed application and replay, including explicit conflict resolutions.
- Reject unreadable local inputs without advancing the source pin or changing their permissions.
