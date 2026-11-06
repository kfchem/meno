; Meno's structures in Office documents (src/ole.rs): the class Word and
; PowerPoint find them by - for this user, as this installer installs for
; this user - written once Meno is in place and taken out before it goes.
; Meno writes and removes the keys itself, so the list of them is kept in
; one place.

; The installer's window shows the wordmark from these bitmaps (installer.nsi,
; MenoInstFilesShow; scripts/icons/installer-logo.ps1 draws them). Defined
; here, outside the macros: inside one, ${__FILEDIR__} is the generated
; script's folder, not this one's.
!define MENO_INSTALLER_IMAGES "${__FILEDIR__}\installer"

!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --register-ole'
  ; A workspace file's own icon (icons\document, docs/FILE-IO.md): the
  ; installer associates .meno with Meno (tauri.windows.conf.json,
  ; fileAssociations) under the ProgID Meno.Workspace, with Meno's own icon;
  ; the document's is put in its place, and Explorer told (UPDATEFILEASSOC,
  ; the installer's own FileAssociation.nsh). Uninstalling
  ; takes the ProgID away whole, its icon with it.
  WriteRegStr SHCTX "Software\Classes\Meno.Workspace\DefaultIcon" "" "$INSTDIR\icons\document\meno-document.ico"
  !insertmacro UPDATEFILEASSOC
  ; What earlier versions installed and this one no longer carries: an
  ; installer over them leaves their files where they were (seen in the
  ; v0.1.7 check). uv has been fetched when first needed since 0.1.7, and
  ; RDKit is a plugin of its own, in resources\plugins\rdkit. Only these
  ; files, each by name - nothing else in the folder is touched. A release
  ; that stops carrying a file adds it here (docs/RELEASING.md).
  Delete "$INSTDIR\resources\py\uv.exe"
  Delete "$INSTDIR\resources\py\requirements.chem.lock"
  Delete "$INSTDIR\resources\workers\chem_worker.py"
  ; 0.1.7's Gaussian input plugin, the Gaussian interface since 0.1.8
  ; (resources\plugins\gaussian): its folder goes once it is empty.
  Delete "$INSTDIR\resources\plugins\gaussian-input\manifest.json"
  Delete "$INSTDIR\resources\plugins\gaussian-input\requirements.lock"
  Delete "$INSTDIR\resources\plugins\gaussian-input\worker.py"
  RMDir "$INSTDIR\resources\plugins\gaussian-input"
  ; 0.1.12: the Python console's worker and Meno's own Python locks, no
  ; longer carried (docs/ARCHITECTURE.md): their folders go once empty.
  Delete "$INSTDIR\resources\workers\interactive_worker.py"
  RMDir "$INSTDIR\resources\workers"
  Delete "$INSTDIR\resources\py\requirements.lock"
  Delete "$INSTDIR\resources\py\requirements.console.lock"
  Delete "$INSTDIR\resources\py\requirements.node.lock"
  RMDir "$INSTDIR\resources\py"
  ; The plugins, no longer carried - each is got online and kept in Meno's
  ; data folder (docs/PLUGINS.md, *Plugins online*): the files the releases
  ; up to 0.1.21 carried go, each by name, and each plugin's folder, then
  ; theirs, once empty.
  Delete "$INSTDIR\resources\plugins\blender\LICENSE"
  Delete "$INSTDIR\resources\plugins\blender\change.py"
  Delete "$INSTDIR\resources\plugins\blender\looks.py"
  Delete "$INSTDIR\resources\plugins\blender\manifest.json"
  Delete "$INSTDIR\resources\plugins\blender\motion_assemble.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_change_liquid.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_change_ring.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_change_scan.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_change_shatter.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_dissolve.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_pulse.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_reveal.py"
  Delete "$INSTDIR\resources\plugins\blender\motion_scan.py"
  Delete "$INSTDIR\resources\plugins\blender\render.py"
  Delete "$INSTDIR\resources\plugins\blender\requirements.lock"
  Delete "$INSTDIR\resources\plugins\blender\studio.py"
  Delete "$INSTDIR\resources\plugins\blender\worker.py"
  Delete "$INSTDIR\resources\plugins\cclib\manifest.json"
  Delete "$INSTDIR\resources\plugins\cclib\requirements.lock"
  Delete "$INSTDIR\resources\plugins\cclib\worker.py"
  Delete "$INSTDIR\resources\plugins\crem\manifest.json"
  Delete "$INSTDIR\resources\plugins\crem\requirements.lock"
  Delete "$INSTDIR\resources\plugins\crem\worker.py"
  Delete "$INSTDIR\resources\plugins\crest\manifest.json"
  Delete "$INSTDIR\resources\plugins\crest\pixi.lock"
  Delete "$INSTDIR\resources\plugins\crest\pixi.toml"
  Delete "$INSTDIR\resources\plugins\crest\worker.py"
  Delete "$INSTDIR\resources\plugins\gaussian\manifest.json"
  Delete "$INSTDIR\resources\plugins\gaussian\requirements.lock"
  Delete "$INSTDIR\resources\plugins\gaussian\worker.py"
  Delete "$INSTDIR\resources\plugins\getting-started\manifest.json"
  Delete "$INSTDIR\resources\plugins\molnextr\manifest.json"
  Delete "$INSTDIR\resources\plugins\molnextr\requirements.lock"
  Delete "$INSTDIR\resources\plugins\molnextr\worker.py"
  Delete "$INSTDIR\resources\plugins\molscribe\manifest.json"
  Delete "$INSTDIR\resources\plugins\molscribe\requirements.lock"
  Delete "$INSTDIR\resources\plugins\molscribe\worker.py"
  Delete "$INSTDIR\resources\plugins\multiwfn\manifest.json"
  Delete "$INSTDIR\resources\plugins\multiwfn\requirements.lock"
  Delete "$INSTDIR\resources\plugins\multiwfn\worker.py"
  Delete "$INSTDIR\resources\plugins\nciplot\manifest.json"
  Delete "$INSTDIR\resources\plugins\nciplot\requirements.lock"
  Delete "$INSTDIR\resources\plugins\nciplot\worker.py"
  Delete "$INSTDIR\resources\plugins\orca\manifest.json"
  Delete "$INSTDIR\resources\plugins\orca\requirements.lock"
  Delete "$INSTDIR\resources\plugins\orca\worker.py"
  Delete "$INSTDIR\resources\plugins\pyscf\manifest.json"
  Delete "$INSTDIR\resources\plugins\pyscf\pixi.lock"
  Delete "$INSTDIR\resources\plugins\pyscf\pixi.toml"
  Delete "$INSTDIR\resources\plugins\pyscf\worker.py"
  Delete "$INSTDIR\resources\plugins\rdkit\conformers_job.py"
  Delete "$INSTDIR\resources\plugins\rdkit\manifest.json"
  Delete "$INSTDIR\resources\plugins\rdkit\requirements.lock"
  Delete "$INSTDIR\resources\plugins\rdkit\worker.py"
  Delete "$INSTDIR\resources\plugins\reinvent\manifest.json"
  Delete "$INSTDIR\resources\plugins\reinvent\requirements.lock"
  Delete "$INSTDIR\resources\plugins\reinvent\worker.py"
  Delete "$INSTDIR\resources\plugins\wfx\manifest.json"
  Delete "$INSTDIR\resources\plugins\wfx\requirements.lock"
  Delete "$INSTDIR\resources\plugins\wfx\worker.py"
  Delete "$INSTDIR\resources\plugins\xtb\manifest.json"
  Delete "$INSTDIR\resources\plugins\xtb\pixi.lock"
  Delete "$INSTDIR\resources\plugins\xtb\pixi.toml"
  Delete "$INSTDIR\resources\plugins\xtb\worker.py"
  RMDir "$INSTDIR\resources\plugins\blender"
  RMDir "$INSTDIR\resources\plugins\cclib"
  RMDir "$INSTDIR\resources\plugins\crem"
  RMDir "$INSTDIR\resources\plugins\crest"
  RMDir "$INSTDIR\resources\plugins\gaussian"
  RMDir "$INSTDIR\resources\plugins\getting-started"
  RMDir "$INSTDIR\resources\plugins\molnextr"
  RMDir "$INSTDIR\resources\plugins\molscribe"
  RMDir "$INSTDIR\resources\plugins\multiwfn"
  RMDir "$INSTDIR\resources\plugins\nciplot"
  RMDir "$INSTDIR\resources\plugins\orca"
  RMDir "$INSTDIR\resources\plugins\pyscf"
  RMDir "$INSTDIR\resources\plugins\rdkit"
  RMDir "$INSTDIR\resources\plugins\reinvent"
  RMDir "$INSTDIR\resources\plugins\wfx"
  RMDir "$INSTDIR\resources\plugins\xtb"
  RMDir "$INSTDIR\resources\plugins"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --unregister-ole'
  ; Meno's listing in Default apps, for the formats the user had it offered
  ; for in Settings (src/defaults.rs): Meno takes out exactly what it wrote,
  ; its one value in the shared RegisteredApplications key and its own keys
  ; - never a key another program's values may be in.
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --unregister-defaults'
!macroend
