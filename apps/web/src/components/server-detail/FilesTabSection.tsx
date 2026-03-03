import { FileBrowser } from "@/components/FileBrowser";
import { FileEditor } from "@/components/FileEditor";

interface FilesTabSectionProps {
  serverId: string;
  editingFile: string | null;
  onEditFile: (path: string) => void;
  onCloseEditor: () => void;
  onServerFilesChanged?: () => void;
}

export function FilesTabSection({
  serverId,
  editingFile,
  onEditFile,
  onCloseEditor,
  onServerFilesChanged,
}: FilesTabSectionProps) {
  return (
    <div className="card">
      {editingFile ? (
        <div className="-m-5 h-[600px]">
          <FileEditor
            serverId={serverId}
            filePath={editingFile}
            onClose={onCloseEditor}
            onServerFilesChanged={onServerFilesChanged}
          />
        </div>
      ) : (
        <>
          <h3 className="mb-4 text-lg font-semibold text-surface-100">File Manager</h3>
          <FileBrowser
            serverId={serverId}
            onEditFile={onEditFile}
            onServerFilesChanged={onServerFilesChanged}
          />
        </>
      )}
    </div>
  );
}
