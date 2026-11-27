# Conversations with an assistant

How to ask a language model about what you put in a frame on the page: it reads what lies there, answers in words, and may put structures and steps there for you to keep or discard. It talks only through a plugin, and nothing leaves the computer until you allow it.

## Putting one down {#putting-down}

1. Double-click empty space, and choose *Conversation* in the row of icons ([Starting on empty space](drawing#quick-add)).
2. An empty frame is put down in free room near where you double-clicked, with a card against its right edge. The conversation opens in the column on the right as well.

Nothing on the page is in it yet, even what you had selected. One undo takes it away.

## What it sees {#frame}

The frame is what the conversation sees. Drag a structure, a molecule in 3D, a text, a PDF, an arrow or a workflow's steps into the frame, to the left of the card: it can read them. Move them out, and it can no longer.

- Drag the frame's tab to move the frame. What lay inside stays where it is, so what the conversation sees changes with it.
- Drag an edge or a corner to size the frame.
- Click the tab to read the conversation in the column on the right.

In the column, three switches say what it may do: *May read what lies inside its frame*, on for a new one; *May propose changes there*, off until you turn it on; and *Sees the whole page*, off unless you turn it on, when the tab says *Sees the whole page* too.

## Asking {#asking}

Click the field at the foot of the card and type your question.

- Enter asks. Shift+Enter starts another line. Escape leaves the field.
- The column has a field of its own at its foot, with *Send*.
- While the model works, the field says *Working…*, the card says *Talking…*, and *Stop* is beside the field. *Stop* ends the turn; what it said so far is kept.
- The card shows what was said in turn: your questions on the right, the replies under them, and each thing it looked at or did as a quiet line. Scroll the card with *Earlier* and *Latest* at its top and foot.
- Each question has its limit, said in the column: *At most 8 replies and 24 tool calls for each message*.

## What an answer may change {#changes}

Where you let it propose changes, an answer may put structures, arrows, pluses and texts inside the frame, add a workflow's steps, wire a set to a step, and set a step's options. Nothing is put outside the frame.

All that one turn changed is one step to undo. The card, and the column, say *It changed the page, as one undo step.*, with *Keep* and *Discard*.

- *Keep* keeps the changes.
- *Discard* takes them all away. Where a step it added is running, it says to stop that step first. Where you have changed the page since, it says so, and undo is yours, step by step.
- Where it changed the options of a step that is done, it says which steps run again the next time you run them.

## What leaves the computer {#sending}

The tab of a conversation's frame says where what lies inside may go:

- *Sends nothing: no model plugin*, while no plugin for talking to a model is added. The field then says *Nothing is sent without a model plugin*.
- *May be sent to*, and the plugin's hosts, once one is added.
- *Stays on this computer*, where what it talks through runs on this computer.

The first time you ask, Meno asks before anything goes: *Send this conversation to* the plugin's hosts, *for* the plugin, and what goes there. *Not now* sends nothing; *Allow* lets it go. Settings, *Network*, lists what you allowed, with *Withdraw* ([Settings](settings#network)).

In the column, the fold under the field counts the requests sent, and lists each one: when, how many characters, and where to. What was sent cannot be recalled: a thing moved out of the frame is not sent again, but what went is gone.

## The plugin and its key {#key}

A conversation talks through a plugin added in Settings, *Plugins* ([Plugins](plugins)). Settings, *Conversations*, shows which plugin does it - *Talking with a model, in a conversation* - and the options it has ([Settings](settings#conversations)).

Where that plugin's service needs a key, type it under *Its key*, in that part of Settings, and choose *Keep*. It is kept in the system's keychain, never shown again, and never written to Meno's log: the field says only *Kept* or *None kept*. *Forget* takes it away.

## Clearing and deleting {#clearing}

What was said and sent is saved with the workspace, in its file.

- *Clear what was said and sent*, in the fold at the foot of the column, empties both. Undo does not bring them back.
- To delete a conversation, point at its frame's tab and press Delete. What was said with it goes too. A conversation that is talking is not deleted.

## What it never does {#never}

A conversation never runs anything: a step it adds runs when you run it. It cannot stop a run, open a file or a folder, fetch anything from the network, or change Settings. It sees nothing outside its frame. Its replies are shown as plain words: no picture in them is loaded, and no link in them is opened.
