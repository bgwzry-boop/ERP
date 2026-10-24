"""Reproduce the vendored, static 400-weight print font from the pinned upstream TTF.
Build-time only: fonttools==4.60.1. No Python/fonttools is needed on the printer.
Usage: python build-package-label-font.py input-NotoSansSC-VF.ttf output-ERPLabelSansSC.ttf
The upstream OFL/copyright stays bundled; the derived family is renamed.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont(sys.argv[1])
instantiateVariableFont(font, {"wght": 400}, inplace=True)
for record in font["name"].names:
    if record.nameID in (1, 3, 4, 6, 16):
        value = "ERPLabelSansSC-Regular" if record.nameID in (3, 6) else "ERP Label Sans SC"
        record.string = value.encode(record.getEncoding())
    elif record.nameID in (2, 17):
        record.string = "Regular".encode(record.getEncoding())
font.save(sys.argv[2])
