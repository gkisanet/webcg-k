# 📚 Task & Learning Objective Management (docs/TASKS.md)

## 🔄 Current Progress

### 🟢 Doing
- [ ] **Dual-Layer Canvas Technique Review & Prototyping**
  *   🎯 **Learning Objective**: Learn how to physically isolate interaction overlays from static vector drawing layers, drastically minimizing DOM paint counts and layout thrashing.

---

### 🟡 Todo (Proposed Future Improvements)
- [ ] **Implement Unified Coordinate Transform (Affine Space Separation)**
  *   🎯 **Learning Objective**: Master 2D transformation matrices and zoom-ratio-aware mouse hit-mapping coordinate formulas, applying them to the UI snapping engine.

---

### 🔴 Done
- [x] **Restore Original English Documentation & Sync Residue Cleanup**
  *   🎯 **Learning Objective**: Master git selective checkout (`git checkout <commit> -- <files>`) to target and restore specific file sets without regressing functional codebases or security patches.
- [x] **Full English Translation of Technical & Architectural Documentation**
  *   🎯 **Learning Objective**: Master systemic documentation structures by mapping all localized guides, setup guidelines, and internal database architectures to high-quality technical English.
- [x] **Excalidraw Core Innovations & Renderer Architecture Trade-off Analysis Completed**
  *   🎯 **Learning Objective**: Compare and analyze functional and performance trade-offs between Canvas 2D API rendering and SVG DOM rendering, establishing appropriate architectural pathways for broadcast signals.
- [x] **Consolidated 65 Fragmented Database Migration Files into a Single Squash**
  *   🎯 **Learning Objective**: Prevent migration fragmentation inside database version control pipelines, learning practical skills to merge schemas into a single file via the Supabase CLI to optimize bootstrap speeds.
- [x] **Debugged & Resolved Search Path Conflicts with Seeding Script (seed.sql)**
  *   🎯 **Learning Objective**: Understand the session isolation side effects of `search_path = ''` introduced during `pg_dump`, and learn how to restore connections gracefully using `RESET search_path;` to prevent seeding failures.
