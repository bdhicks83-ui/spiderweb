---
name: windows-file-safety
description: CRITICAL file-handling rules for Brian's Windows environment. Violating these causes silent broken builds. Use EVERY time you hand over a file to create or edit locally - code files, markdown, SQL, anything. Also covers the wrong-folder trap and double-extension bug.
---

# Windows File Safety

## Rule 1 — PowerShell heredoc for files over ~50 lines
Notepad **silently truncates large pastes** -> broken builds where the old code keeps running. Recurring, confirmed bug.

Always hand over files like this:
```powershell
@'
<ENTIRE FILE CONTENT>
'@ | Set-Content -Path "src\path\to\file.ts" -Encoding utf8
```
Run from the repo root. Never say "open in Notepad and paste" for anything substantial.
(If the file content itself contains a line starting with '@, adjust the delimiter or write in two parts.)

## Rule 2 — Full files only, never snippets
No diffs, no "find this line," no partial edits. Always the complete file to paste over the old one.

## Rule 3 — The right folder
- CORRECT: C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb
- TRAP: C:\Users\BDHIC\human-bloom — boilerplate only, files saved here vanish from the real app
- Safe pattern: open files via terminal from repo root (notepad src\app\api\extract\route.ts) so the path is guaranteed.

## Rule 4 — Watch for double extensions
Windows hides extensions -> route.ts becomes route.ts.ts or route.ts.txt silently. If a new file "doesn't exist" to the build, check this first:
```powershell
Get-ChildItem -Recurse -Include *.ts.txt,*.ts.ts,*.tsx.txt
```

## Rule 5 — Multi-step commands = ONE paste block
When commands can safely run in sequence, combine them into a single copy/paste block. Never make Brian paste 4 separate commands.
