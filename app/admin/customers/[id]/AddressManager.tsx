"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Star, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AddressDTO } from "@/lib/dto/customer";
import { addAddress, deleteAddress, updateAddress } from "../actions";

interface Props {
  customerId: string;
  addresses: AddressDTO[];
  canWrite: boolean;
}

export function AddressManager({ customerId, addresses, canWrite }: Props) {
  const [editing, setEditing] = useState<AddressDTO | "new" | null>(null);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Adressen</h3>
          {canWrite && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4 mr-1" /> Neue Adresse
            </Button>
          )}
        </div>

        {addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Adressen erfasst.
          </p>
        ) : (
          <ul className="space-y-2">
            {addresses.map((a) => (
              <AddressRow
                key={a.id}
                address={a}
                canWrite={canWrite}
                onEdit={() => setEditing(a)}
              />
            ))}
          </ul>
        )}

        {editing && (
          <AddressDialog
            customerId={customerId}
            initial={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AddressRow({
  address,
  canWrite,
  onEdit,
}: {
  address: AddressDTO;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onDelete = () => {
    if (!confirm("Diese Adresse wirklich löschen?")) return;
    start(async () => {
      try {
        await deleteAddress(address.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Fehler");
      }
    });
  };

  return (
    <li className="flex items-start justify-between rounded border px-3 py-2 text-sm">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase">
            {address.type === "BOTH"
              ? "Rechnung + Lieferung"
              : address.type === "BILLING"
              ? "Rechnungsadresse"
              : "Lieferadresse"}
          </span>
          {address.isDefault && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold">
              <Star className="h-3 w-3" /> Standard
            </span>
          )}
        </div>
        <div className="font-medium">{address.street}</div>
        <div className="text-muted-foreground">
          {address.zip} {address.city}
          {address.canton && ` (${address.canton})`} · {address.country}
        </div>
      </div>
      {canWrite && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-accent"
            title="Edit"
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function AddressDialog({
  customerId,
  initial,
  onClose,
}: {
  customerId: string;
  initial: AddressDTO | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({
    type: initial?.type ?? "BOTH",
    street: initial?.street ?? "",
    zip: initial?.zip ?? "",
    city: initial?.city ?? "",
    canton: initial?.canton ?? "",
    country: initial?.country ?? "CH",
    isDefault: initial?.isDefault ?? false,
  });

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        const payload = {
          type: data.type,
          street: data.street,
          zip: data.zip,
          city: data.city,
          canton: data.canton || undefined,
          country: data.country.toUpperCase(),
          isDefault: data.isDefault,
        };
        if (initial) {
          await updateAddress(initial.id, payload);
        } else {
          await addAddress(customerId, payload);
        }
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler");
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-lg max-h-[80vh] overflow-y-auto">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between">
            <h3 className="font-semibold">
              {initial ? "Adresse bearbeiten" : "Neue Adresse"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-accent"
              aria-label="Schliessen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Typ">
              <Select
                value={data.type}
                onChange={(e) =>
                  setData({ ...data, type: e.target.value as AddressDTO["type"] })
                }
              >
                <option value="BOTH">Rechnung + Lieferung</option>
                <option value="BILLING">Nur Rechnung</option>
                <option value="SHIPPING">Nur Lieferung</option>
              </Select>
            </Field>
            <Field label="Land">
              <Input
                value={data.country}
                maxLength={2}
                onChange={(e) =>
                  setData({ ...data, country: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Strasse + Nr." full>
              <Input
                value={data.street}
                onChange={(e) => setData({ ...data, street: e.target.value })}
              />
            </Field>
            <Field label="PLZ">
              <Input
                value={data.zip}
                onChange={(e) => setData({ ...data, zip: e.target.value })}
              />
            </Field>
            <Field label="Ort">
              <Input
                value={data.city}
                onChange={(e) => setData({ ...data, city: e.target.value })}
              />
            </Field>
            <Field label="Kanton (optional)" full>
              <Input
                value={data.canton}
                onChange={(e) => setData({ ...data, canton: e.target.value })}
                placeholder="BE, ZH, …"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.isDefault}
              onChange={(e) => setData({ ...data, isDefault: e.target.checked })}
            />
            Als Standard-Adresse markieren
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={pending}>Save</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
