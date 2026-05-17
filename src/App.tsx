"use client"

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, Hash, Copy, CheckCircle, Loader2, X, FileText, Trash2 } from "lucide-react";

declare global {
  interface Window {
    Go: any;
    hashFile: (fileData: Uint8Array, algorithm?: string) => string;
  }
}

interface FileItem {
  id: string;
  file: File;
  hashHex?: string;
  hashDecimal?: string;
  algorithm?: string;
  status: 'pending' | 'loading' | 'calculating' | 'complete' | 'error';
  error?: string;
}

const HASH_ALGORITHMS: { value: string; label: string }[] = [
  { value: "xxh3", label: "XXH3" },
  { value: "sha256", label: "SHA-256" },
  { value: "sha512", label: "SHA-512" },
  { value: "sha1", label: "SHA-1" },
  { value: "md5", label: "MD5" },
];

const App: React.FC = () => {
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState<string>("");
  const [algorithm, setAlgorithm] = useState<string>("xxh3");
  const [pendingRecalculation, setPendingRecalculation] = useState(false);

  // Load WASM on component mount
  useEffect(() => {
    const loadWasm = async () => {
      try {
        console.log('Loading WASM...');
        const script = document.createElement('script');
        // Use Vite's base URL for correct path resolution
        const baseUrl = import.meta.env.BASE_URL;
        script.src = `${baseUrl}wasm_exec.js`;
        script.onload = async () => {
          console.log('wasm_exec.js loaded');
          const go = new window.Go();
          const result = await WebAssembly.instantiateStreaming(
            fetch(`${baseUrl}main.wasm`),
            go.importObject
          );
          console.log('WASM instantiated');
          go.run(result.instance);
          console.log('WASM running');

          // Verify the function is available
          if (typeof window.hashFile === 'function') {
            console.log('hashFile function is available');
            setWasmLoaded(true);
          } else {
            console.error('hashFile function not found after WASM load');
            setError('WASM function not available');
          }
        };
        script.onerror = (err) => {
          console.error('Failed to load wasm_exec.js:', err);
          setError('Failed to load WASM script');
        };
        document.head.appendChild(script);
      } catch (err) {
        console.error('WASM loading error:', err);
        setError(`Failed to load WASM: ${err}`);
      }
    };
    loadWasm();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      const newFiles: FileItem[] = Array.from(selectedFiles).map(file => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        status: 'pending' as const
      }));
      setFiles(prev => [...prev, ...newFiles]);
      setError("");
    }
  };

  const calculateHash = async (fileItem: FileItem) => {
    if (!wasmLoaded) return;

    // Set loading state
    setFiles(prev => prev.map(f =>
      f.id === fileItem.id
        ? { ...f, status: 'loading' as const, error: undefined }
        : f
    ));

    try {
      console.log(`Loading file: ${fileItem.file.name} (${fileItem.file.size} bytes)`);

      const arrayBuffer = await fileItem.file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Set calculating state
      setFiles(prev => prev.map(f =>
        f.id === fileItem.id
          ? { ...f, status: 'calculating' as const }
          : f
      ));

      console.log(`Starting hash calculation for: ${fileItem.file.name}`);

      const result = JSON.parse(window.hashFile(uint8Array, algorithm));

      // Set complete state
      setFiles(prev => prev.map(f =>
        f.id === fileItem.id
          ? { ...f, status: 'complete' as const, hashHex: result.hex, hashDecimal: result.decimal, algorithm }
          : f
      ));

      console.log(`Hash completed: ${result.hex}`);
    } catch (err) {
      setFiles(prev => prev.map(f =>
        f.id === fileItem.id
          ? { ...f, status: 'error' as const, error: `Error calculating hash: ${err}` }
          : f
      ));
      console.error('Hash calculation error:', err);
    }
  }; const calculateAllHashes = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0 || !wasmLoaded) return;

    setPendingRecalculation(false);

    try {
      // Process files one by one
      for (const fileItem of pendingFiles) {
        await calculateHash(fileItem);
      }
    } catch (err) {
      console.error('Error processing files:', err);
      setError(`Error processing files: ${err}`);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearAllFiles = () => {
    setFiles([]);
  };

  const copyToClipboard = async (hash: string, fileId: string) => {
    await navigator.clipboard.writeText(hash);
    setCopied(fileId);
    setTimeout(() => setCopied(""), 2000);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Reset completed hashes when algorithm changes
  useEffect(() => {
    if (!wasmLoaded || files.length === 0) return;
    const hasComplete = files.some(f => f.status === 'complete');
    if (!hasComplete) return;

    setFiles(prev => prev.map(f =>
      f.status === 'complete' ? { ...f, status: 'pending' as const, hashHex: undefined, hashDecimal: undefined, algorithm: undefined } : f
    ));
    setPendingRecalculation(true);
  }, [algorithm]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-lg mb-4">
            <Hash className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Hash Forge
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Calculate hashes of your files. All processing happens locally in your browser.
          </p>
        </div>

        {/* WASM Status */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border">
            <div className={`w-2 h-2 rounded-full ${wasmLoaded ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <span className="text-sm font-medium text-gray-700">
              WASM Engine: {wasmLoaded ? "Ready" : "Loading..."}
            </span>
          </div>
        </div>

        {/* File Upload Card */}
        <Card className="mb-6 shadow-sm border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Select Files
            </CardTitle>
            <CardDescription>
              Choose one or more files to calculate their hashes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hash Algorithm
                </label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  disabled={!wasmLoaded || files.some(f => f.status === 'loading' || f.status === 'calculating')}
                >
                  {HASH_ALGORITHMS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <Input
              type="file"
              onChange={handleFileSelect}
              className="border-2 border-dashed"
              disabled={!wasmLoaded}
              multiple
            />

            {files.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">
                    {files.length} file{files.length > 1 ? 's' : ''} selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={calculateAllHashes}
                      disabled={!wasmLoaded || files.every(f => f.status !== 'pending')}
                      className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 focus:bg-green-200 focus:border-green-400 focus:ring-2 focus:ring-green-300 focus:outline-none disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400 transition-all duration-200"
                    >
                      {files.some(f => f.status === 'loading' || f.status === 'calculating') ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin text-green-600" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Hash className="h-4 w-4 mr-2 text-green-600" />
                          {pendingRecalculation ? "Recalculate All Hashes" : "Calculate All Hashes"}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearAllFiles}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Files List */}
        {files.length > 0 && (
          <div className="space-y-4 mb-6">
            {files.map((fileItem) => (
              <Card key={fileItem.id} className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        <FileText className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium text-gray-900 truncate">
                            {fileItem.file.name}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {formatFileSize(fileItem.file.size)}
                          </Badge>
                        </div>

                        {/* Hash Result */}
                        {fileItem.hashHex && (
                          <div className="bg-gray-50 p-3 rounded-lg border">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs font-mono">
                                  {fileItem.algorithm ? HASH_ALGORITHMS.find(a => a.value === fileItem.algorithm)?.label ?? fileItem.algorithm : "XXH3"}
                                </Badge>
                                <span className="text-xs text-gray-500">hash</span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(fileItem.hashHex!, fileItem.id)}
                              >
                                {copied === fileItem.id ?
                                  <CheckCircle className="h-4 w-4 text-green-600" /> :
                                  <Copy className="h-4 w-4" />
                                }
                              </Button>
                            </div>
                            <code className="text-sm font-mono text-gray-800 break-all">
                              {fileItem.hashHex}
                            </code>
                            {fileItem.hashDecimal && (
                              <div className="mt-1 pt-1 border-t border-gray-200">
                                <span className="text-xs text-gray-400 mr-1">decimal:</span>
                                <code className="text-sm font-mono text-gray-600 break-all">
                                  {fileItem.hashDecimal}
                                </code>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Error Message */}
                        {fileItem.error && (
                          <Alert variant="destructive">
                            <AlertDescription className="text-sm">
                              {fileItem.error}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Status for pending/processing */}
                        {!fileItem.hashHex && !fileItem.error && (
                          <div className="text-sm text-gray-500">
                            {fileItem.status === 'loading' && (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Processing file...
                              </div>
                            )}
                            {fileItem.status === 'calculating' && (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Calculating hash...
                              </div>
                            )}
                            {fileItem.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4" />
                                Ready to process
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          fileItem.status === 'complete' ? 'default' :
                            fileItem.status === 'error' ? 'destructive' : 'secondary'
                        }
                      >
                        {fileItem.status === 'loading' || fileItem.status === 'calculating' ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        {fileItem.status === 'complete' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {fileItem.status === 'loading' ? 'Loading...' :
                          fileItem.status === 'calculating' ? 'Calculating...' :
                            fileItem.status === 'complete' ? 'Complete' :
                              fileItem.status === 'error' ? 'Error' : 'Pending'}
                      </Badge>

                      {fileItem.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => calculateHash(fileItem)}
                          disabled={!wasmLoaded}
                        >
                          <Hash className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFile(fileItem.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-6">
            <Alert variant="destructive">
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Info Card */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-blue-600" />
              About Hash Forge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              This tool uses Go compiled to WebAssembly to calculate hashes directly in your browser.
              Files never leave your device.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 border">
                <h4 className="font-medium text-gray-900 mb-2">Available Algorithms</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {HASH_ALGORITHMS.map((a) => (
                    <li key={a.value} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      {a.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border">
                <h4 className="font-medium text-gray-900 mb-2">Key Features</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    100% Private — files never leave your device
                  </li>
                  <li className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-blue-600" />
                    Powered by WebAssembly
                  </li>
                  <li className="flex items-center gap-2">
                    <Upload className="h-3.5 w-3.5 text-purple-600" />
                    Process multiple files at once
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default App;