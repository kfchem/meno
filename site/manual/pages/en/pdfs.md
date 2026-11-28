# PDFs

How to put a paper on the page, read it beside your work, take its structures out as structures you can edit, and make new PDFs from its pages.

## Opening a PDF {#opening}

- Drop a PDF on Meno's window: it is put down where you drop it, as an icon with its name under it. Several can be dropped at once.
- Or right-click empty space and choose *Open…* (⌘O on a Mac, Ctrl+O on Windows).
- Right-click the PDF and choose *Show full size* to see its pages as a stack on the page; *Minimize to an icon* makes it an icon again.
- *Delete PDF*, on the same menu, or the Delete key with the pointer over it, takes it off the page.

## Turning pages {#pages}

- With the pointer over a PDF shown full size, ← and → (or Page Up and Page Down) turn its pages. As the pointer rests on the top page its corners fold: click the right one for the next page, the left one for the page before.
- *Previous page* and *Next page* are on its right-click menu too.
- *Spread pages* lays its pages out side by side, and *Gather pages* stacks them again. Pages dragged to places of their own go back into rows with *Put pages in rows*.

## Reading {#reading}

Double-click a PDF, or choose *Read* on its right-click menu. It opens in a column on the right of the page, its pages one under another, with a tab at the top for each PDF or text you are reading.

- Turn the wheel to scroll; pinch, or hold ⌘ (Ctrl on Windows) and turn the wheel, to zoom. On a touch screen, drag with one finger to scroll and pinch with two to zoom. ← and → go a page at a time.
- Click the page number to go to a page; double-click it to fit the pages to the column's width.
- *Fill the workspace* (⇧⌘F, or Ctrl+Shift+F) gives the column the whole window; *Back beside the canvas* puts it back.
- On a touch screen, a finger drags the pages up and down.
- *Hide texts* closes the column, and the PDF stays on the page. *Show texts*, on the right-click menu of empty space, opens it again.

A text file or a Markdown text (.txt, .md) dropped on the window is read the same way, under a tab of its own beside the PDFs. Click a tab to show what it holds, and the × on it to stop reading it. A Markdown text is shown formatted. While its tab is chosen, the top of the column has a button marked `</>`, its tip *Show source*: a click shows what the text is written in, and a second click, its tip now *Show formatted*, goes back.

## Finding words {#find}

While a PDF is on the page, right-click empty space and choose *Find in PDF…* (⌘F, or Ctrl+F). A field opens at the top of the column: type what to find, and choose *This PDF* or *All PDFs*. Enter goes to the next place it is found, Shift+Enter to the one before, and Escape closes the field.

## Taking structures out {#structures}

Structures drawn in a PDF with lines and letters, as journals draw them, are read by Meno itself, with no plugin.

- In the reading column, point at a structure: it lights up. Drag it onto the page, and it is put down there as a structure to edit like any you draw.
- Or click structures to choose them (⌘ or Shift and a click for more), right-click, and choose *Put on the page* to put them beside the PDF, or *Copy*.
- Select words in the column and drag them onto the page: they become text there, and *Show in the PDF*, on the text's right-click menu, goes back to where they came from.

A structure read from a figure says where it came from as the pointer rests on it. While Meno is unsure of some of it, a note stands beside it, "Read from a figure: check it", with how many parts are unsure. Compare it with the figure; when it is right, right-click one of its atoms or bonds, or the note, and choose *Checked against the figure*.

## Compounds by their numbers {#compounds}

A paper names its compounds by numbers. Rest the pointer on one in the text - a **12** set in bold, or the 12 of "compound 12" - and a card opens beside it: a picture of where the PDF draws that compound, its number, its page, and the other pages it is drawn on, as "p. 2 · also on p. 5".

- Drag the picture onto the page: where Meno read the structure whole, it is put down there, as when it is dragged out of its figure.
- Click its page to go to the figure in the reading column; the structure is marked there for a moment.
- A number set plainly, not in bold and not after a word like "compound", brings a card while ⌥ (Alt on Windows) is held with the pointer on it.
- While Meno is still going through the figures, the card says "Reading this PDF’s figures…". When the number is drawn nowhere in the PDF, it says "No drawing of this compound was found in this PDF."

The card comes in the reading column, and on a PDF shown full size on the page once its words are large enough to read.

## Figures as pictures {#figures}

- In the reading column, drag across a figure, or where there are no words, to draw a box; a click in a figure takes the whole figure. On a PDF shown full size on the page, zoom in, then press and hold and drag.
- Drag the box onto the page for a picture of it, or right-click it for *Put on the page*, *Copy picture* and *Read as structure*.
- *Read as structure* puts the structure in the box beside the PDF. Meno reads it itself, whether the figure is drawn with lines or is a picture - a scan, or a figure saved as an image. A picture on the page has *Read as structure* on its right-click menu too.
- Where Meno reads nothing, it says why. If a plugin that reads structures from pictures has been added ([Plugins](plugins#roles)), *Read with* and the plugin's name is offered then, and the plugin reads the picture only when that is chosen.

## Writing on a PDF {#writing}

Choose *Write on it* on the PDF's right-click menu. The pen's card opens, with *Pen*, *Marker* and *Eraser*; *Done*, or Escape, ends it. What you write stays on its page.

## New PDFs from its pages {#making}

Meno never changes a PDF it was given: each of these makes a new one, put beside it as an icon.

- *Page numbers…*: numbers at the foot of every page - 1, 2, 3 or S1, S2, S3, from the number you choose, at the left, in the centre or at the right. *Make numbered copy* makes it.
- *Pages…*: its pages in a row. Drag them into another order; choose some (a click, Shift and a click, ⌘ or Ctrl and a click, or their numbers typed under *Select pages*, such as 1-3); *Turn left*, *Turn right* or *Take out* them. *Make new PDF* makes it; for the pages chosen alone, the button beside it says how many, as *Extract selected (2)*.
- Choose two PDFs or more, right-click one of them, and choose *Combine into one PDF*.
- *Save as PDF…* saves a PDF as a file, where you choose.

## Printing {#printing}

- With a PDF in the reading column, press ⌘P (Ctrl+P on Windows), press the printer button at the top of the column, or right-click the PDF and choose *Print…*. The system's own print dialog opens; where to print, how many copies and which pages are chosen there, and *Save as PDF* in it makes a file of every page.
- A PDF whose author does not allow printing cannot be printed: the printer button is greyed and its tip says "Its author does not allow printing."
- On a Mac, the first print asks to find devices on your local network. That is the system looking for printers: printing to a PDF file works whichever answer is given.

## Kept in the workspace {#kept}

A PDF on the page is saved in the .meno file with the workspace, so the workspace opens again with it, wherever the PDF itself has gone.
