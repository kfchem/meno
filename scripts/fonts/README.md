# Label font metrics

```
npm run font-metrics -- <font.ttf|otf> <EXPORT_NAME> "<Family>" > src/lib/chem/fonts/<name>.ts
```

Writes what a label is placed and cleared by, for one font file: how far each
printable ASCII character advances the pen, and the convex outline of its ink.
Only the typefaces a label should be placed by before any font file has been
read need a table: any other is read from its file when first used
(`src/ui/fonts/typefaces.ts`). Register a table in
`src/lib/chem/fonts/index.ts`.

The hull is worked out as the app works it out for a font it reads
(`src/lib/chem/glyphHull.ts`): curves are followed in eight steps; the hull is eased to fewer sides by
dropping any corner standing less than 15 units (of a 2048-unit em) off the
line between its neighbours, so it cuts into the ink by no more than that -
under a hundredth of an em, a tenth of a point in a 10 pt label.

`src/lib/chem/arial.ts` keeps its own form, but nothing in it comes from
Arial's font file, which is not Meno's to pass on: its hulls are made by
this tool from Arimo-Regular.ttf (googlefonts/arimo, SIL OFL 1.1), a font
made to Arial's metrics, and its advances are the ones every such font
shares - checked equal to Arimo's when the hulls were made. Only the
capital height and the x-height are Arial's own figures, from its OS/2
table: Arimo's outlines are brought to them as they are read, its
capitals and digits by one vertical scale to the capital height, its
lowercase by another to the x-height and its ascenders on up to the
capital height (Meno's choice); the table keeps Arimo's own, as this
tool writes them. Make any other table from a font
whose licence lets its outlines be passed on.
