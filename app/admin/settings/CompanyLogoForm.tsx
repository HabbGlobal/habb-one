"use client";

// Logo-Upload für die Firma. Klein und fokussiert:
//   - File-Picker (nur PNG/JPG, max 1 MB)
//   - Live-Vorschau (FileReader → Object-URL)
//   - Speichert via Server-Action
//   - Aktuelles Logo wird über /api/company/logo angezeigt; mit
//     Cache-Bust-Param damit nach Upload der Browser neu lädt.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { setCompanyLogo, clearCompanyLogo } from "./actions";

interface Props {
  /** Wenn true, ist im Server schon ein Logo gespeichert. */
  hasLogo: boolean;
  /** Cache-Bust-Token damit der Browser ein neues Logo nach Update lädt. */
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
      setError("Nur PNG oder JPG erlaubt.");
      return;
    }
    if (file.size > 1_000_000) {
      setError(`Bild zu groß (${(file.size / 1024).toFixed(0)} KB) — max. 1 MB.`);
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
    reader.onerror = () => setError("Datei konnte nicht gelesen werden.");
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
        setSuccess("Logo gespeichert.");
        setStagedFile(null);
        setPreviewUrl(null);
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  const remove = () => {
    if (!confirm("Firmenlogo entfernen?")) return;
    start(async () => {
      try {
        await clearCompanyLogo();
        setSuccess("Logo entfernt.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4" /> Firmenlogo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Wird auf allen generierten Dokumenten (Offerten, Rechnungen,
          Lieferscheine, Berichte) oben rechts eingebettet und in der Sidebar
          neben dem Firmennamen angezeigt.
        </p>

        {/* Aktuelles oder Vorschau-Logo */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="rounded-lg border-2 border-dashed border-habb-line bg-habb-paper w-44 h-28 flex items-center justify-center overflow-hidden">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Vorschau"
                className="max-w-full max-h-full object-contain"
              />
            ) : hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/company/logo?v=${logoVersion}`}
                alt="Aktuelles Logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground italic">
                kein Logo
              </span>
            )}
          </div>

          <div className="space-y-2 flex-1 min-w-[240px]">
            <label
              htmlFor="logo-input"
              className="inline-flex items-center gap-2 cursor-pointer rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              <Upload className="h-4 w-4" />
              Bild auswählen
              <input
                id="logo-input"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPick(f);
                  // Reset damit gleiches File neu pickbar ist
                  e.target.value = "";
                }}
                disabled={pending}
              />
            </label>
            {stagedFile && (
              <div className="text-xs text-muted-foreground">
                Bereit zum Hochladen — {(stagedFile.sizeBytes / 1024).toFixed(0)} KB
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              PNG oder JPG, max. 1 MB. Empfohlen: ~400×200 px transparent (PNG).
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
              Logo entfernen
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
            >
              Abbrechen
            </Button>
          )}
          <Button
            type="button"
            onClick={upload}
            disabled={pending || !stagedFile}
          >
            {pending ? "Speichere …" : "Logo speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
