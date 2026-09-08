import os
import re

emoji_pattern = re.compile(
    "["
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F700-\U0001F77F"  # alchemical symbols
    "\U0001F780-\U0001F7FF"  # Geometric Shapes Extended
    "\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
    "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
    "\U0001FA00-\U0001FA6F"  # Chess Symbols
    "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
    "\U00002702-\U000027B0"  # Dingbats
    "\U000024C2-\U0001F251"
    "\U00002600-\U000026FF"  # Misc symbols (like ⚡, ⚙)
    "]+",
    flags=re.UNICODE,
)

target_dir = r"client\src"

import sys
sys.stdout.reconfigure(encoding='utf-8')

results = {}

for root, dirs, files in os.walk(target_dir):
    for f in files:
        if f.endswith(".jsx") or f.endswith(".js"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8", errors="ignore") as fp:
                lines = fp.readlines()
            for idx, line in enumerate(lines):
                matches = emoji_pattern.findall(line)
                if matches:
                    clean_matches = [m for m in matches if any(ord(c) > 127 for c in m)]
                    if clean_matches:
                        if path not in results:
                            results[path] = []
                        results[path].append((idx + 1, ' '.join(clean_matches), line.strip()[:100]))

for file_path, items in results.items():
    print(f"\n====================================\nFILE: {file_path} ({len(items)} instances)")
    for line_num, icons, snippet in items:
        print(f"  L{line_num:4d} | {icons} | {snippet}")



