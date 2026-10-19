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

; Meno offered in Explorer's Open With for the files it reads - structures
; and PDFs, as src/opened.rs (OPENED_WITH) and Info.plist list them, a test
; holding the three alike - and never made their default (docs/FILE-IO.md,
; *Opening a workspace file from the system*). For each: Meno's ProgID
; among the extension's OpenWithProgids, a value of its own beside any other
; program's (Microsoft, "How to Include an Application in the Open With
; Dialog Box"), and the extension among Meno.exe's SupportedTypes (Microsoft,
; "Application Registration": Applications\<exe>). The extension's own
; default, and every other value there, are left as they are. In SHCTX, as
; the installer's .meno association is: this user's, as Meno is installed.
!define MENO_OPEN_WITH "Meno.OpenWith"
; (Meno.exe's own key named in the macros: MAINBINARYNAME is defined after
; this file is included, and is there by the time a macro is put in.)
!define MENO_APPLICATIONS "Software\Classes\Applications"

!macro MENO_OPEN_WITH_TYPES M
  !insertmacro ${M} "mol"
  !insertmacro ${M} "sdf"
  !insertmacro ${M} "rxn"
  !insertmacro ${M} "xyz"
  !insertmacro ${M} "pdb"
  !insertmacro ${M} "cube"
  !insertmacro ${M} "cub"
  !insertmacro ${M} "pdf"
!macroend

!macro MENO_OFFER EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MENO_OPEN_WITH}" ""
  WriteRegStr SHCTX "${MENO_APPLICATIONS}\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
!macroend

; Meno's value taken out, and the keys it was put in only where nothing else
; is left in them (DeleteRegKey /ifempty: no subkeys and no values): another
; program's ProgIDs, and the extension's default, stay.
!macro MENO_UNOFFER EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MENO_OPEN_WITH}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --register-ole'
  ; A workspace file's own icon (icons\document, docs/FILE-IO.md): the
  ; installer associates .meno with Meno (tauri.windows.conf.json,
  ; fileAssociations) under the ProgID Meno.Workspace, with Meno's own icon;
  ; the document's is put in its place, and Explorer told (UPDATEFILEASSOC,
  ; the installer's own FileAssociation.nsh). Uninstalling
  ; takes the ProgID away whole, its icon with it.
  WriteRegStr SHCTX "Software\Classes\Meno.Workspace\DefaultIcon" "" "$INSTDIR\icons\document\meno-document.ico"
  ; Open With (above): the ProgID that opens a file in Meno, Meno.exe's own
  ; entry, and each file type's two values.
  WriteRegStr SHCTX "Software\Classes\${MENO_OPEN_WITH}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\${MENO_OPEN_WITH}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  WriteRegStr SHCTX "${MENO_APPLICATIONS}\${MAINBINARYNAME}.exe" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${MENO_APPLICATIONS}\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  !insertmacro MENO_OPEN_WITH_TYPES MENO_OFFER
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
  ; Open With: each file type's value, then Meno's ProgID and Meno.exe's
  ; entry, both its own alone - and Explorer told.
  !insertmacro MENO_OPEN_WITH_TYPES MENO_UNOFFER
  DeleteRegKey SHCTX "Software\Classes\${MENO_OPEN_WITH}"
  DeleteRegKey SHCTX "${MENO_APPLICATIONS}\${MAINBINARYNAME}.exe"
  !insertmacro UPDATEFILEASSOC
!macroend
