import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types mirrored from server ────────────────────────────────────────────────
interface FieldOption { id: string; label: string; }
interface PreviewResult {
  headers: string[];
  mapping: Record<string, string>;   // header → fieldId
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  fields: FieldOption[];
}
interface ExecuteResult { created: number; errors: string[]; }

// ── Step indicators ───────────────────────────────────────────────────────────
const STEPS = ["Upload file", "Map columns", "Import"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8" data-testid="import-step-bar">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
            i < current  ? "text-primary" : "",
            i === current ? "bg-primary text-primary-foreground" : "",
            i > current  ? "text-muted-foreground" : "",
          )}>
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border",
              i < current  ? "bg-primary border-primary text-primary-foreground" : "",
              i === current ? "bg-primary-foreground border-primary-foreground text-primary" : "",
              i > current  ? "border-muted-foreground text-muted-foreground" : "",
            )}>
              {i < current ? "✓" : i + 1}
            </span>
            {label}
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("h-px w-8 mx-1", i < current ? "bg-primary" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────
function UploadStep({ onUploaded }: { onUploaded: (file: File, result: PreviewResult) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/preview", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Upload failed");
      }
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (data, file) => onUploaded(file, data),
    onError: (e: Error) => setError(e.message),
  });

  const handleFile = useCallback((file: File) => {
    setError(null);
    const ok = file.name.match(/\.(csv|xlsx|xls|ods)$/i);
    if (!ok) { setError("Please upload a CSV or Excel file (.csv, .xlsx, .xls)"); return; }
    previewMutation.mutate(file);
  }, []);

  return (
    <div className="max-w-lg mx-auto">
      <div
        data-testid="upload-dropzone"
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
          previewMutation.isPending ? "pointer-events-none opacity-60" : "",
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.ods"
          className="hidden"
          data-testid="input-file-upload"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {previewMutation.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={40} className="text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Reading file and mapping columns…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <FileSpreadsheet size={40} className="text-muted-foreground" />
            <div>
              <p className="font-medium">Drop your file here, or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">CSV, Excel (.xlsx / .xls) supported</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 text-destructive text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-6 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground">Tips</p>
        <p>• The first row must be column headers (e.g. "First Name", "Email").</p>
        <p>• Column names don't need to match exactly — the app will suggest the best match.</p>
        <p>• Every column will be reviewed before anything is imported.</p>
        <p>• Columns that don't fit any field will go into the contact's Notes.</p>
      </div>
    </div>
  );
}

// ── Step 2: Map columns ───────────────────────────────────────────────────────
function MapStep({
  file, preview, onConfirmed, onBack,
}: {
  file: File;
  preview: PreviewResult;
  onConfirmed: (result: ExecuteResult) => void;
  onBack: () => void;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>(preview.mapping);
  const { toast } = useToast();

  const executeMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/import/execute", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Import failed");
      }
      return res.json() as Promise<ExecuteResult>;
    },
    onSuccess: onConfirmed,
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  // Count how many columns are mapped to each field (to warn about duplicates)
  const fieldUsage: Record<string, string[]> = {};
  for (const [h, f] of Object.entries(mapping)) {
    if (f === "skip") continue;
    if (!fieldUsage[f]) fieldUsage[f] = [];
    fieldUsage[f].push(h);
  }

  // Confidence badge for each header
  function confidenceBadge(header: string) {
    const f = mapping[header];
    if (f === "skip") return <Badge variant="outline" className="text-xs text-muted-foreground">Skipped</Badge>;
    if (f === "fullName") return <Badge variant="secondary" className="text-xs">Suggested</Badge>;
    return <Badge className="text-xs bg-primary/10 text-primary border-0">Matched</Badge>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Found <span className="font-medium text-foreground">{preview.totalRows} contacts</span> in <span className="font-medium text-foreground">{file.name}</span>.
            Review the column assignments below and correct any mistakes before importing.
          </p>
        </div>
      </div>

      {/* Mapping table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-1/3">Your column</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-1/4">Sample value</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Maps to</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {preview.headers.map((header, i) => {
              const sample = preview.sampleRows[0]?.[header];
              const sampleStr = sample != null ? String(sample) : "—";
              const currentField = mapping[header] ?? "skip";
              const isDupe = fieldUsage[currentField]?.length > 1 && currentField !== "skip" && currentField !== "notes";

              return (
                <tr key={header} className={cn("border-b last:border-0", isDupe ? "bg-yellow-500/5" : "")}>
                  <td className="px-4 py-3 font-mono text-xs text-foreground font-medium">{header}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[140px]" title={sampleStr}>
                    {sampleStr.length > 30 ? sampleStr.slice(0, 30) + "…" : sampleStr}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={currentField}
                      onValueChange={val => setMapping(m => ({ ...m, [header]: val }))}
                    >
                      <SelectTrigger
                        className="h-8 text-xs w-52"
                        data-testid={`select-field-${i}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.fields.map(f => (
                          <SelectItem key={f.id} value={f.id} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isDupe && (
                      <p className="text-xs text-yellow-600 mt-1">Multiple columns mapped here</p>
                    )}
                  </td>
                  <td className="px-4 py-3">{confidenceBadge(header)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sample preview */}
      {preview.sampleRows.length > 0 && (
        <details className="rounded-xl border">
          <summary className="px-4 py-3 text-sm font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground">
            Preview first {Math.min(preview.sampleRows.length, 5)} rows
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  {preview.headers.map(h => (
                    <th key={h} className="px-3 py-2 text-left font-mono text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-t">
                    {preview.headers.map(h => (
                      <td key={h} className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row[h] != null ? String(row[h]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} data-testid="button-import-back">
          <ChevronLeft size={16} className="mr-1" /> Back
        </Button>
        <Button
          onClick={() => executeMutation.mutate()}
          disabled={executeMutation.isPending}
          data-testid="button-import-confirm"
        >
          {executeMutation.isPending
            ? <><RefreshCw size={14} className="mr-2 animate-spin" /> Importing…</>
            : <><Upload size={14} className="mr-2" /> Import {preview.totalRows} contacts</>
          }
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Done ──────────────────────────────────────────────────────────────
function DoneStep({ result, onImportAnother, onClose }: { result: ExecuteResult; onImportAnother: () => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  // Invalidate contacts list so the Contacts page refreshes
  queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-6">
      <div className="flex justify-center">
        <CheckCircle2 size={56} className="text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Import complete</h2>
        <p className="text-muted-foreground mt-1">
          <span className="font-medium text-foreground">{result.created}</span> contact{result.created !== 1 ? "s" : ""} added successfully.
          Each one has a 6-month check-in reminder set automatically.
        </p>
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left space-y-1 text-sm">
          <p className="font-medium text-destructive flex items-center gap-1.5">
            <AlertCircle size={14} /> {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped
          </p>
          <ul className="text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
            {result.errors.map((e, i) => <li key={i} className="font-mono text-xs">{e}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="outline" onClick={onImportAnother} data-testid="button-import-another">
          Import another file
        </Button>
        <Button onClick={onClose} data-testid="button-go-contacts">
          View contacts <ArrowRight size={14} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────
export default function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);

  function reset() {
    setStep(0); setFile(null); setPreview(null); setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import contacts</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Import from a CSV or Excel file. Columns are matched automatically — review before importing.
          </p>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          <StepBar current={step} />

          {step === 0 && (
            <UploadStep
              onUploaded={(f, r) => { setFile(f); setPreview(r); setStep(1); }}
            />
          )}
          {step === 1 && file && preview && (
            <MapStep
              file={file}
              preview={preview}
              onConfirmed={r => { setResult(r); setStep(2); }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && result && (
            <DoneStep result={result} onImportAnother={reset} onClose={handleClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
