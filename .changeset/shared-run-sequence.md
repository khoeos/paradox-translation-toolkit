---
"@ptt/desktop": patch
"@ptt/cli": patch
---

Fixed: the scan preview ignored the "Complete file" setting and always counted missing keys as
if "Only missing keys" was selected. A target list the run would refuse could also be scanned
first. In French, fourteen plural forms were empty, so counts in the millions rendered blank.
