"""
Generate a publication-quality pipeline figure (PDF + PNG).

Run:
    python scripts/pipeline_figure.py
Output:
    figures/pipeline_overview.pdf
    figures/pipeline_overview.png
"""

from __future__ import annotations
import os
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.patheffects as pe

# ── output dir ──────────────────────────────────────────────────────────────
OUT_DIR = Path(__file__).parent.parent / "figures"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── colour palette ───────────────────────────────────────────────────────────
C = {
    "input":    "#0ea5e9",   # sky-500
    "ga":       "#8b5cf6",   # violet-500
    "esmfold":  "#10b981",   # emerald-500
    "agent":    "#f59e0b",   # amber-500
    "af2":      "#ef4444",   # red-500
    "output":   "#64748b",   # slate-500
    "bg":       "#0f172a",   # slate-900
    "card":     "#1e293b",   # slate-800
    "border":   "#334155",   # slate-700
    "text":     "#f1f5f9",   # slate-100
    "muted":    "#94a3b8",   # slate-400
    "arrow":    "#475569",   # slate-600
}

# ── figure setup ─────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(18, 11), facecolor=C["bg"])
ax  = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 18)
ax.set_ylim(0, 11)
ax.axis("off")
ax.set_facecolor(C["bg"])


# ── helpers ───────────────────────────────────────────────────────────────────

def box(ax, x, y, w, h, color, label, sublabel="", alpha=0.9,
        radius=0.25, fontsize=9.5, icon=""):
    """Draw a rounded box with a label."""
    patch = FancyBboxPatch(
        (x - w/2, y - h/2), w, h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=1.5, edgecolor=color, facecolor=C["card"],
        alpha=alpha, zorder=3,
    )
    ax.add_patch(patch)
    # colour bar on left edge
    bar = FancyBboxPatch(
        (x - w/2, y - h/2), 0.12, h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=0, facecolor=color, alpha=0.85, zorder=4,
    )
    ax.add_patch(bar)
    # label
    full_label = f"{icon}  {label}" if icon else label
    ax.text(x + 0.05, y + (0.18 if sublabel else 0), full_label,
            ha="center", va="center", color=C["text"],
            fontsize=fontsize, fontweight="bold", zorder=5)
    if sublabel:
        ax.text(x + 0.05, y - 0.32, sublabel,
                ha="center", va="center", color=C["muted"],
                fontsize=7.2, zorder=5)


def arrow(ax, x1, y1, x2, y2, label="", color=None):
    color = color or C["arrow"]
    ax.annotate("",
        xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(
            arrowstyle="-|>", color=color,
            lw=1.8, mutation_scale=16,
            connectionstyle="arc3,rad=0.0",
        ), zorder=2,
    )
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        ax.text(mx + 0.08, my, label, color=C["muted"],
                fontsize=7, ha="left", va="center", zorder=5)


def pill(ax, x, y, text, color):
    """Small pill badge."""
    ax.text(x, y, text, ha="center", va="center",
            color="white", fontsize=6.5, fontweight="bold",
            bbox=dict(boxstyle="round,pad=0.25", facecolor=color,
                      edgecolor="none", alpha=0.9),
            zorder=6)


def section_label(ax, x, y, text):
    ax.text(x, y, text, ha="center", va="center",
            color=C["muted"], fontsize=7.5,
            fontstyle="italic", zorder=5)


# ═══════════════════════════════════════════════════════════════════════════
# TITLE
# ═══════════════════════════════════════════════════════════════════════════
ax.text(9, 10.55, "SSTR2-cpGFP Biosensor Design Pipeline",
        ha="center", va="center", color=C["text"],
        fontsize=16, fontweight="bold", zorder=5)
ax.text(9, 10.15, "Genetic Algorithm  ·  ESMFold (monomer)  ·  AF2 Multimer (receptor–ligand)",
        ha="center", va="center", color=C["muted"],
        fontsize=9.5, zorder=5)

# horizontal divider under title
ax.plot([0.4, 17.6], [9.9, 9.9], color=C["border"], lw=1, zorder=2)

# ═══════════════════════════════════════════════════════════════════════════
# PHASE BANDS (background)
# ═══════════════════════════════════════════════════════════════════════════
phases = [
    (0.3,  3.35, "Phase 0\nInputs",          C["input"]),
    (3.35, 6.4,  "Phase 1\nGA Search",        C["ga"]),
    (6.4,  9.45, "Phase 2\nESMFold Scoring",  C["esmfold"]),
    (9.45, 12.5, "Phase 3\nAgent Selection",  C["agent"]),
    (12.5, 15.55,"Phase 4\nAF2 Multimer",     C["af2"]),
    (15.55,17.7, "Phase 5\nOutputs",          C["output"]),
]
for x0, x1, label, color in phases:
    rect = mpatches.FancyBboxPatch(
        (x0, 0.4), x1-x0, 9.25,
        boxstyle="round,pad=0,rounding_size=0.1",
        linewidth=0, facecolor=color, alpha=0.04, zorder=0,
    )
    ax.add_patch(rect)
    ax.text((x0+x1)/2, 9.6, label,
            ha="center", va="center", color=color,
            fontsize=7.5, fontweight="bold", alpha=0.9, zorder=1)

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 0 — Inputs
# ═══════════════════════════════════════════════════════════════════════════
box(ax, 1.85, 7.7, 2.7, 0.95, C["input"], "SSTR2 Receptor",
    "369 AA · UniProt NP_001041.1\nGPCR · 7 TM helices", fontsize=8.5)

box(ax, 1.85, 5.9, 2.7, 0.95, C["input"], "cpGFP (cp145)",
    "219 AA · circularly permuted\nΔF/F fluorescence reporter", fontsize=8.5)

box(ax, 1.85, 4.1, 2.7, 0.95, C["input"], "Somatostatin-28",
    "28 AA · SANSNPAMAPRERK…\nGPCR agonist ligand (ECL binder)", fontsize=8.5)

# input legend
section_label(ax, 1.85, 2.95, "data/ligands.faa")
section_label(ax, 1.85, 2.65, "Seed sequences")

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 1 — Genetic Algorithm
# ═══════════════════════════════════════════════════════════════════════════
# GA main box
box(ax, 4.9, 7.0, 2.8, 2.5, C["ga"], "Genetic Algorithm",
    "Pop=30 · Gen=40 · Top-k=5\nMutates loop residues + linkers\n+ ICL3 insertion position",
    fontsize=8.5)

# local scorer sub-boxes
box(ax, 4.0, 4.1, 1.15, 0.7, C["ga"], "Conservation",
    "BLOSUM62\n45%", fontsize=7, radius=0.15)
box(ax, 5.25, 4.1, 1.15, 0.7, C["ga"], "FP Score",
    "brightness\n30%", fontsize=7, radius=0.15)
box(ax, 6.5, 4.1, 1.15, 0.7, C["ga"], "TM Integrity",
    "helix check\n25%", fontsize=7, radius=0.15)

section_label(ax, 4.9, 3.45, "Local fitness (no API calls) — runs inside GA loop")

# what the GA mutates
mut_items = [
    (3.65, 2.35, "ECL1\n83–89"),
    (4.35, 2.35, "ICL2\n117–124"),
    (5.05, 2.35, "ECL2\n149–173"),
    (5.75, 2.35, "ICL3\n205–252"),
    (6.45, 2.35, "ECL3\n281–287"),
]
ax.text(4.9, 2.75, "Co-evolved regions:", color=C["muted"],
        fontsize=7, ha="center", va="center", zorder=5)
colors_mut = [C["input"], C["ga"], C["input"], C["af2"], C["input"]]
for (mx, my, mt), mc in zip(mut_items, colors_mut):
    pill(ax, mx, my, mt, mc)

# WT baseline (alongside GA)
box(ax, 4.9, 8.7, 2.0, 0.65, C["esmfold"], "WT Baseline",
    "ICL3@228 · GGSGGS linker\nESMFold reference structure", fontsize=7.5)

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 2 — ESMFold
# ═══════════════════════════════════════════════════════════════════════════
box(ax, 7.9, 7.0, 2.8, 2.2, C["esmfold"], "ESMFold (Tamarind)",
    "Top-5 chimeric sequences\nMonomer folding · ~5 API calls\nOutputs: pLDDT, pTM, PDB",
    fontsize=8.5)

# cache box
box(ax, 7.9, 4.4, 2.2, 0.85, C["esmfold"], "Cache Layer",
    "tamarind_cache.json\nSkips re-scoring identical seqs",
    fontsize=7.5, radius=0.15)

section_label(ax, 7.9, 3.65, "Chimeric = SSTR2[:pos] + linker_N + cpGFP + linker_C + SSTR2[pos:]")
section_label(ax, 7.9, 3.35, "~600 AA · scored as monomer for structural quality")

# WT baseline arrow (goes up to esmfold)
box(ax, 7.9, 8.7, 2.0, 0.65, C["esmfold"], "WT PDB (reference)",
    "pLDDT baseline · RMSD anchor", fontsize=7.5)

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 3 — Agent Selection
# ═══════════════════════════════════════════════════════════════════════════
box(ax, 10.95, 7.0, 2.8, 2.2, C["agent"], "Claude Agent",
    "Reads esmfold_results.json\nRanks by pLDDT + diversity\nSelects top-5 for AF2",
    fontsize=8.5)

box(ax, 10.95, 4.55, 2.2, 0.75, C["agent"], "af2_shortlist.json",
    "5 candidate sequences\nwith rationale", fontsize=7.5, radius=0.15)

section_label(ax, 10.95, 3.75, "Agent model: claude-sonnet-4-6")
section_label(ax, 10.95, 3.45, "Considers structural quality + sequence diversity")

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 4 — AF2 Multimer
# ═══════════════════════════════════════════════════════════════════════════
box(ax, 14.0, 7.0, 2.9, 2.2, C["af2"], "AF2 Multimer (Tamarind)",
    "Chain A: chimeric SSTR2-cpGFP\nChain B: Somatostatin-28\n~5 API calls · modelType=v3",
    fontsize=8.5)

# scores from AF2
score_items = [
    (13.1, 4.55, "pLDDT\nstructure"),
    (14.05, 4.55, "pTM\nglobal"),
    (15.0, 4.55, "ipTM\ninterface"),
]
for sx, sy, st in score_items:
    pill(ax, sx, sy, st, C["af2"])

box(ax, 14.0, 3.75, 2.2, 0.7, C["af2"], "RMSD vs WT",
    "TM-align · global RMSD\nconformation change score",
    fontsize=7.5, radius=0.15)

section_label(ax, 14.0, 3.1, "ipTM = interface pTM (receptor–ligand contact quality)")

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 5 — Outputs
# ═══════════════════════════════════════════════════════════════════════════
outputs = [
    (16.85, 8.45, "af2_results.json",  "Top-5 ranked candidates"),
    (16.85, 7.35, "top5.json",         "Full structs + scores"),
    (16.85, 6.25, "pareto_front.png",  "pLDDT vs ipTM trade-off"),
    (16.85, 5.15, "PDB files",         "results/pdb/*.pdb"),
    (16.85, 4.05, "Agent summary",     "Demo narrative (Claude)"),
]
for ox, oy, olabel, osub in outputs:
    box(ax, ox, oy, 2.15, 0.72, C["output"], olabel, osub,
        fontsize=7.2, radius=0.15)

# ═══════════════════════════════════════════════════════════════════════════
# FINAL SCORE FORMULA
# ═══════════════════════════════════════════════════════════════════════════
formula_box = FancyBboxPatch(
    (12.7, 2.3), 4.55, 0.65,
    boxstyle="round,pad=0,rounding_size=0.12",
    linewidth=1, edgecolor=C["output"], facecolor=C["card"], alpha=0.9, zorder=3,
)
ax.add_patch(formula_box)
ax.text(14.95, 2.625,
        "final_score  =  0.35·pLDDT  +  0.30·ipTM  +  0.20·RMSD_score  +  0.15·local_fitness",
        ha="center", va="center", color=C["text"],
        fontsize=8.5, fontfamily="monospace", zorder=5)
ax.text(14.95, 2.42, "Composite ranking formula",
        ha="center", va="center", color=C["muted"], fontsize=7, zorder=5)

# ═══════════════════════════════════════════════════════════════════════════
# ARROWS — main flow
# ═══════════════════════════════════════════════════════════════════════════
# Inputs → GA
arrow(ax, 3.2, 7.7,  3.5, 7.4,  color=C["input"])   # SSTR2
arrow(ax, 3.2, 5.9,  3.7, 6.5,  color=C["input"])   # cpGFP
arrow(ax, 3.2, 4.1,  3.5, 5.9,  color=C["input"])   # SST-28 → note: goes to AF2 later

# GA → ESMFold
arrow(ax, 6.3, 7.0,  6.5, 7.0,  color=C["ga"])

# ESMFold → Agent
arrow(ax, 9.3, 7.0,  9.5, 7.0,  color=C["esmfold"])

# Agent → AF2
arrow(ax, 12.35, 7.0, 12.55, 7.0, color=C["agent"])

# AF2 → Outputs
arrow(ax, 15.45, 7.0, 15.75, 7.0, color=C["af2"])

# Local scorers → GA (upward)
arrow(ax, 4.0,  4.45, 4.3,  5.75, color=C["ga"])
arrow(ax, 5.25, 4.45, 5.05, 5.75, color=C["ga"])
arrow(ax, 6.5,  4.45, 6.5,  5.75, color=C["ga"])

# WT baseline
arrow(ax, 4.9, 8.35,  4.9, 8.05,  color=C["esmfold"])  # GA → WT
arrow(ax, 5.9, 8.7,   6.9, 8.7,   color=C["esmfold"])  # WT → WT PDB
arrow(ax, 8.9, 8.7,   9.5, 8.05,  color=C["esmfold"])  # WT PDB → RMSD

# Cache
arrow(ax, 7.9, 5.82,  7.9, 5.1,   color=C["esmfold"])

# AF2 shortlist
arrow(ax, 10.95, 5.92, 10.95, 4.93, color=C["agent"])

# SST-28 → AF2 (dashed, ligand bypass)
ax.annotate("",
    xy=(12.55, 6.6), xytext=(3.2, 4.1),
    arrowprops=dict(
        arrowstyle="-|>", color=C["input"],
        lw=1.4, mutation_scale=13,
        connectionstyle="arc3,rad=-0.28",
        linestyle="dashed",
    ), zorder=2,
)
ax.text(8.0, 2.75, "SST-28 → AF2 Chain B", color=C["input"],
        fontsize=7, ha="center", va="center",
        fontstyle="italic", zorder=5)

# AF2 scores → formula
arrow(ax, 14.0, 4.15, 14.0, 2.95, color=C["af2"])

# ═══════════════════════════════════════════════════════════════════════════
# BUDGET TRACKER  (bottom strip)
# ═══════════════════════════════════════════════════════════════════════════
ax.plot([0.4, 17.6], [1.85, 1.85], color=C["border"], lw=0.8, zorder=2)
ax.text(1.3, 1.5, "API Budget (Tamarind):", color=C["muted"],
        fontsize=8, fontweight="bold", va="center", zorder=5)

budget_items = [
    (3.8,  "WT baseline",    1,  C["esmfold"]),
    (6.1,  "ESMFold (GA)",   5,  C["esmfold"]),
    (8.4,  "Agent selects",  0,  C["agent"]),
    (10.7, "AF2 multimer",   5,  C["af2"]),
    (13.0, "Total used",    11,  C["output"]),
    (15.3, "Remaining",     84,  C["input"]),
]
for bx, blabel, bcount, bcolor in budget_items:
    ax.text(bx, 1.65, blabel, color=C["muted"],
            fontsize=7, ha="center", va="center", zorder=5)
    ax.text(bx, 1.25, f"~{bcount} calls", color=bcolor,
            fontsize=9, fontweight="bold", ha="center", va="center", zorder=5)

# ═══════════════════════════════════════════════════════════════════════════
# FOOTER
# ═══════════════════════════════════════════════════════════════════════════
ax.text(9, 0.6,
        "SSTR2 biosensor design  ·  Tamarind API (ESMFold + AF2)  ·  Claude (agent selection & summary)  ·  YC Bio Hack 2026",
        ha="center", va="center", color=C["muted"], fontsize=7, zorder=5)

# ═══════════════════════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════════════════════
pdf_path = OUT_DIR / "pipeline_overview.pdf"
png_path = OUT_DIR / "pipeline_overview.png"
fig.savefig(pdf_path, dpi=200, bbox_inches="tight", facecolor=C["bg"])
fig.savefig(png_path, dpi=200, bbox_inches="tight", facecolor=C["bg"])
print(f"Saved: {pdf_path}")
print(f"Saved: {png_path}")
