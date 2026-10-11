#!/bin/zsh
# build.sh - compiles the kit's Swift tools into $MENO_REC/bin
set -e
: ${MENO_REC:?set MENO_REC - see README.md}
mkdir -p $MENO_REC/bin
for t in winrec framekit framevid imgdiff psnr grab; do
  swiftc -O ${0:a:h}/$t.swift -o $MENO_REC/bin/$t
done
ls $MENO_REC/bin
