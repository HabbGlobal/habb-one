"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Star, Plus, Mail, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactDTO } from "@/lib/dto/customer";
import { addContact, deleteContact, updateContact } from "../actions";

interface Props {
  customerId: string;
  contacts: ContactDTO[];
  canWrite: boolean;
}

export function ContactManager({ customerId, contacts, canWrite }: Props) {
  const [editing, setEditing] = useState<ContactDTO | "new" | null>(null);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Kontakte</h3>
          {canWrite && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4 mr-1" /> Neuer Kontakt
            </Button>
          )}
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Kontakte erfasst.
          </p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                canWrite={canWrite}
                onEdit={() => setEditing(c)}
              />
            ))}
          </ul>
        )}

        {editing && (
          <ContactDialog
            customerId={customerId}
            initial={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ContactRow({
  contact,
  canWrite,
  onEdit,
}: {
  contact: ContactDTO;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onDelete = () => {
    if (!confirm("Kontakt wirklich löschen?")) return;
    start(async () => {
      try {
        await deleteContact(contact.id);
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
          <span className="font-medium">
            {contact.salutation && `${contact.salutation} `}
            {contact.firstName} {contact.lastName}
          </span>
          {contact.isPrimary && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold">
              <Star className="h-3 w-3" /> Hauptkontakt
            </span>
          )}
        </div>
        {contact.position && (
          <div className="text-xs text-muted-foreground">{contact.position}</div>
        )}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Mail className="h-3 w-3" /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Phone className="h-3 w-3" /> {contact.phone}
            </a>
          )}
          {contact.mobile && (
            <a
              href={`tel:${contact.mobile}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Phone className="h-3 w-3" /> {contact.mobile} (mobil)
            </a>
          )}
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

function ContactDialog({
  customerId,
  initial,
  onClose,
}: {
  customerId: string;
  initial: ContactDTO | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({
    salutation: initial?.salutation ?? "",
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    position: initial?.position ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    mobile: initial?.mobile ?? "",
    isPrimary: initial?.isPrimary ?? false,
  });

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        const payload = {
          salutation: data.salutation || undefined,
          firstName: data.firstName,
          lastName: data.lastName,
          position: data.position || undefined,
          email: data.email || undefined,
          phone: data.phone || undefined,
          mobile: data.mobile || undefined,
          isPrimary: data.isPrimary,
        };
        if (initial) await updateContact(initial.id, payload);
        else await addContact(customerId, payload);
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
      <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-lg max-h-[85vh] overflow-y-auto">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between">
            <h3 className="font-semibold">
              {initial ? "Kontakt bearbeiten" : "Neuer Kontakt"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Anrede">
              <Input
                value={data.salutation}
                onChange={(e) => setData({ ...data, salutation: e.target.value })}
                placeholder="Herr / Frau / Divers"
              />
            </Field>
            <Field label="Position">
              <Input
                value={data.position}
                onChange={(e) => setData({ ...data, position: e.target.value })}
                placeholder="z. B. Einkauf"
              />
            </Field>
            <Field label="First Name">
              <Input
                value={data.firstName}
                onChange={(e) => setData({ ...data, firstName: e.target.value })}
                required
              />
            </Field>
            <Field label="Last Name">
              <Input
                value={data.lastName}
                onChange={(e) => setData({ ...data, lastName: e.target.value })}
                required
              />
            </Field>
            <Field label="Email" full>
              <Input
                type="email"
                value={data.email}
                onChange={(e) => setData({ ...data, email: e.target.value })}
              />
            </Field>
            <Field label="Telefon (Festnetz)">
              <Input
                value={data.phone}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
              />
            </Field>
            <Field label="Mobile">
              <Input
                value={data.mobile}
                onChange={(e) => setData({ ...data, mobile: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.isPrimary}
              onChange={(e) => setData({ ...data, isPrimary: e.target.checked })}
            />
            Als Hauptkontakt markieren
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
