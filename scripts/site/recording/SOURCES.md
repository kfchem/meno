# Structures in the website's pictures

Each SMILES is PubChem's isomeric SMILES (PUG REST, property SMILES), fetched in October 2026.
RDKit's InChIKey from the SMILES equals PubChem's for every entry.

- cholesterol (the first picture): PubChem CID 5997, C27H46O, InChIKey HVYWMOMLDIMFJA-DPAQBDIFSA-N
  C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C
- artemisinin: PubChem CID 68827, C15H22O5, InChIKey BLUAFEHZUWYNDE-NNWCWBAJSA-N
  C[C@@H]1CC[C@H]2[C@H](C(=O)O[C@H]3[C@@]24[C@H]1CC[C@](O3)(OO4)C)C
- epothilone B: PubChem CID 448013, C27H41NO6S, InChIKey QXRSDHAAWVKZLJ-PVYNADRNSA-N
  C[C@H]1CCC[C@@]2([C@@H](O2)C[C@H](OC(=O)C[C@@H](C(C(=O)[C@@H]([C@H]1O)C)(C)C)O)/C(=C/C3=CSC(=N3)C)/C)C
- morphine: PubChem CID 5288826, C17H19NO3, InChIKey BQJCRHHNABKAKU-KBQPJGBKSA-N
  CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O
- paclitaxel: PubChem CID 36314, C47H51NO14, InChIKey RCINICONZNJXQF-MZXODVADSA-N
  CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C
- prostaglandin F2alpha: PubChem CID 5280363, C20H34O5, InChIKey PXGPLTODNUVGFL-YNNPMVKQSA-N
  CCCCC[C@@H](/C=C/[C@H]1[C@@H](C[C@@H]([C@@H]1C/C=C\CCCC(=O)O)O)O)O
- quinine: PubChem CID 3034034, C20H24N2O2, InChIKey LOUPRKONTZGTKE-WZBLMQSHSA-N
  COC1=CC2=C(C=CN=C2C=C1)[C@H]([C@@H]3C[C@@H]4CCN3C[C@@H]4C=C)O
- strychnine: PubChem CID 441071, C21H22N2O2, InChIKey QMGVPVSNSZLJIA-FVWCLLPLSA-N
  C1CN2CC3=CCO[C@H]4CC(=O)N5[C@H]6[C@H]4[C@H]3C[C@H]2[C@@]61C7=CC=CC=C75

Paclitaxel itself comes from `scripts/gui/fixtures/messy-taxol.mol` (the same InChIKey); its SMILES is listed for the record.
