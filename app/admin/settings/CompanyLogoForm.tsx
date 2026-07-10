"use client";

// Logo upload for the company. Small and focused:
//   - File picker (only PNG/JPG, max 1 MB)
//   - Live preview (FileReader → Object URL)
//   - Saves via Server Action
//   - Current logo is shown via /api/company/logo; with
//     cache-bust param so the browser reloads after upload.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { setCompanyLogo, clearCompanyLogo } from "./actions";

interface Props {
  /** If true, the server already has a logo stored. */
  hasLogo: boolean;
  /** Cache-bust token so the browser reloads the logo after update. */
  logoVersion: string;
}

export function CompanyLogoForm({ hasLogo, logoVersion }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<{
    mimeType: string;
    base64: string;
    sizeBytes: number;
  } | null>(null);

  const onPick = (file: File) => {
    setError(null);
    setSuccess(null);
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      setError("Only PNG or JPG allowed.");
      return;
    }
    if (file.size > 1_000_000) {
      setError(`Image too large (${(file.size / 1024).toFixed(0)} KB) — max. 1 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreviewUrl(result);
      setStagedFile({
        mimeType: file.type,
        base64: result,
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => setError("File could not be read.");
    reader.readAsDataURL(file);
  };

  const upload = () => {
    if (!stagedFile) return;
    setError(null);
    start(async () => {
      try {
        await setCompanyLogo({
          mimeType: stagedFile.mimeType,
          dataBase64: stagedFile.base64,
        });
        setSuccess("Logo saved.");
        setStagedFile(null);
        setPreviewUrl(null);
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const remove = () => {
    if (!confirm("Remove company logo?")) return;
    start(async () => {
      try {
        await clearCompanyLogo();
        setSuccess("Logo removed.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4" /> Company logo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
<<<<<<< HEAD
          Will be embedded at the top right of all generated documents (quotes, invoices, delivery notes, reports) and displayed in the sidebar next to the company name.
        </p>

        {/* Current or preview logo */}
=======
          Embedded top-right on all generated documents (quotes, invoices,
          delivery notes, reports) and shown in the sidebar next to the
          company name.
        </p>

        {/* Current logo or preview */}
>>>>>>> f0bfc268c2f2ece681b2305c28e6da1a442e79c6
        <div className="flex items-center gap-4 flex-wrap">
          <div className="rounded-lg border-2 border-dashed border-habb-line bg-habb-paper w-44 h-28 flex items-center justify-center overflow-hidden">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full max-h-full object-contain"
              />
            ) : hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/company/logo?v=${logoVersion}`}
                alt="Current logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No logo
              </span>
            )}
          </div>

          <div className="space-y-2 flex-1 min-w-[240px]">
            <label
              htmlFor="logo-input"
              className="inline-flex items-center gap-2 cursor-pointer rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              <Upload className="h-4 w-4" />
              Choose image
              <input
                id="logo-input"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPick(f);
<<<<<<< HEAD
                  // Reset so the same file can be selected again
=======
                  // Reset so the same file can be picked again
>>>>>>> f0bfc268c2f2ece681b2305c28e6da1a442e79c6
                  e.target.value = "";
                }}
                disabled={pending}
              />
            </label>
            {stagedFile && (
              <div className="text-xs text-muted-foreground">
                Ready to upload — {(stagedFile.sizeBytes / 1024).toFixed(0)} KB
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              PNG or JPG, max. 1 MB. Recommended: ~400×200 px transparent (PNG).
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          {hasLogo && !stagedFile && (
            <Button
              type="button"
              variant="ghost"
              onClick={remove}
              disabled={pending}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Remove logo
            </Button>
          )}
          {stagedFile && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStagedFile(null);
                setPreviewUrl(null);
              }}
              disabled={pending}
            >Cancel</Button>
          )}
          <Button
            type="button"
            onClick={upload}
            disabled={pending || !stagedFile}
          >
            {pending ? "Saving …" : "Save logo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
