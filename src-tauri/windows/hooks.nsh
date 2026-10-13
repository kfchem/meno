; Meno's structures in Office documents (src/ole.rs): the class Word and
; PowerPoint find them by - for this user, as this installer installs for
; this user - written once Meno is in place and taken out before it goes.
; Meno writes and removes the keys itself, so the list of them is kept in
; one place.

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
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --unregister-ole'
!macroend
