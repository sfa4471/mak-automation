/// <reference types="react-scripts" />

/** File System Access API (Chrome, Edge) - for "Choose folder" on this device */
interface FileSystemDirectoryHandle {
  readonly name: string;
  queryPermission(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemFileHandle>;
}
interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}
interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}
