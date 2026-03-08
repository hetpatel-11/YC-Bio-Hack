"""
Minimal live Tamarind test — 1 ESMFold call only.

Submits the WT chimeric SSTR2-cpGFP@ICL3 sequence (600 AA) to ESMFold
and prints the pLDDT score. If the sequence is already in the cache,
uses the cached result (0 API calls consumed).

Run:
    python test_tamarind_live.py
"""

from __future__ import annotations

import os
from dotenv import load_dotenv
load_dotenv()

from scorers.tamarind import esmfold_plddt, remaining_calls, _load_counter

# Build the WT chimeric sequence (same as pipeline.py baseline)
SSTR2 = (
    "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEPYYDLTSNAVLTFIYFVVCIIGLCGNTLVIYVILR"
    "YAKMKTITNIYILNLAIADELFMLGLPFLAMQVALVHWPFGKAICRVVMTVDGINQFTSIFCLTVMSIDR"
    "YLAVVHPIKSAKWRRPRTAKMITMAVWGVSLLVILPIMIYAGLRSNQWGRSSCTINWPGESGAWYTGFII"
    "YTFILGFLVPLTIICLCYLFIIIKVKSSGIRVGSSKRKKSEKKVTRMVSIVVAVFIFCWLPFYIFNVSSV"
    "SMAISPTPALKGMFDFVVVLTYANSCANPILYAFLSDNFKKSFQNVLCLVKVSGTDDGERSDSKQDKSRL"
    "NETTETQRTLLNGDLQTSI"
)
CPGFP = (
    "MTTFKIESRIHGNLNGEKFELVGGGVGEEGRLEIEMKTKDKPLAFSPFLLSHCMGYGFYH"
    "FASFPKGTKNIYLHAATNGGYTNTRKEIYEDGGILEVNFRYTYEFNKIIGDVECIGHGFP"
    "SQSPIFKDTIVKSCPTVDLMLPMSGNIIASSYARAFQLKDGSFYTAEVKNNIDFKNPIHE"
    "SFSKSGPMFTHRRVEETHTKENLAMVEYQQVFNSAPRDM"
)
LINKER   = "GGSGGS"
INSERT   = LINKER + CPGFP + LINKER
CHIMERIC = SSTR2[:228] + INSERT + SSTR2[228:]

print("=" * 60)
print("  Live Tamarind ESMFold test — WT chimeric SSTR2-cpGFP")
print("=" * 60)
print(f"  Chimeric length : {len(CHIMERIC)} AA")
print(f"  Insert position : 228 (ICL3 mid-point)")
print(f"  Calls before    : {_load_counter()} used / {_load_counter() + remaining_calls()} budget")
print()

result = esmfold_plddt(CHIMERIC)

print()
print(f"  pLDDT           : {result.get('plddt')}")
print(f"  PDB returned    : {'yes' if result.get('pdb') else 'no'}")
print(f"  Calls after     : {_load_counter()} used / {_load_counter() + remaining_calls()} budget")
print()

plddt = result.get("plddt")
if plddt is not None:
    if plddt >= 70:
        print(f"  Result: GOOD — pLDDT {plddt:.1f} ≥ 70 (confident fold)")
    else:
        print(f"  Result: LOW — pLDDT {plddt:.1f} < 70 (marginal fold confidence)")
else:
    print("  Result: pLDDT not returned — check API response format")
    print(f"  Raw keys: {list(result.get('raw', {}).keys())}")

print("=" * 60)
