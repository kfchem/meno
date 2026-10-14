import type { JSX } from "react";
import type { DocumentStore } from "../../lib/doc";
import SettingsPanel from "../features/SettingsPanel";

import type {
  TabId,
  TabInstance,
  TabContentBase,
  TabKind,
} from "../../lib/core";
import { Workspace } from "../../ui/features/Workspace";
import { useAppSettings } from "../../lib/settings/appSettings";
import {
  createWorkspaceDocument,
  type WorkspaceDocument,
} from "../features/Workspace/document";

export type ViewProps = {
  tabId: TabId;
  content: TabContentBase;
  active: boolean;
  dispatchPatchData: (patch: unknown) => void;
  /** Names the tab anew: after the file it was saved as. */
  renameTab: (label: string) => void;
  /** Present once the view's kind declares `createDocument` (see ViewEntry). */
  document?: DocumentStore<any>;
};

export type ViewEntry = {
  kind: TabKind;
  Component: (p: ViewProps) => JSX.Element;
  create: (label: string) => TabInstance;
  keepAlive?: boolean; // if false, unmount when tab inactive (for heavy WebGL views)
  /**
   * Views opt into documents (undo/redo, saving) by building one from the
   * tab's data. Without this the view keeps owning its own state, as before.
   */
  createDocument?: (data: unknown) => DocumentStore<any>;
  /** Mirrors the document back into the tab's data. */
  toTabData?: (state: any) => Record<string, unknown>;
};

const create = (label: string, kind: TabKind, data?: unknown): TabInstance => {
  const id = crypto.randomUUID();
  return {
    meta: { id, label },
    content: { kind, data },
  } as unknown as TabInstance;
};

export const viewRegistry: Record<TabKind, ViewEntry> = {
  settings: {
    kind: "settings",
    Component: () => <SettingsPanel />,
    create: (label) => create(label, "settings", {}),
  },
  workspace: {
    kind: "workspace",
    // (in Settings' style as it is made, and kept: Settings' is for new workspaces only)
    createDocument: (data) => createWorkspaceDocument(data, useAppSettings.getState().drawingStyle),
    Component: ({ tabId, content, active, document, renameTab }) => (
      <Workspace
        tabId={tabId}
        active={active}
        document={document as DocumentStore<WorkspaceDocument>}
        initialFilename={(content as any)?.data?.filename}
        initialPayload={(content as any)?.data?.payload}
        initialKind={(content as any)?.data?.kind}
        initialPath={(content as any)?.data?.path}
        officeId={(content as any)?.data?.officeId}
        nameTab={renameTab}
      />
    ),
    create: (label) => create(label, "workspace", {}),
  },
};

export default viewRegistry;
