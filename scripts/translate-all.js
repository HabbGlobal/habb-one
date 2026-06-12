const fs = require('fs');
const path = require('path');

const dictionary = {
  // Common Buttons & Actions
  "Speichern fehlgeschlagen.": "Save failed.",
  "Fehler beim Speichern.": "Error while saving.",
  "Fehler beim Speichern": "Error while saving",
  "Speichern …": "Saving...",
  "Alles speichern": "Save all",
  "Speichern": "Save",
  "Abbrechen — zurück zum Passkey": "Cancel — back to passkey",
  "Abbrechen + Code sperren": "Cancel + lock code",
  "Abbrechen": "Cancel",
  "Löschen (Soft-Delete)": "Delete (soft delete)",
  "Löschen": "Delete",
  "Bearbeiten": "Edit",
  "Einstellungen ansehen": "View settings",
  "Einstellungen bearbeiten": "Edit settings",
  "Einstellungen": "Settings",
  "Zurück zur Übersicht": "Back to overview",
  "Zurück zum Login": "Back to login",
  "← Zurück": "← Back",
  "Zurück": "Back",
  "Neu": "New",
  "Erfolgreich": "Successful",
  "Fehlgeschlagen": "Failed",
  "Guten Tag": "Hello",
  "Bitte": "Please",

  // Forms & Tables
  "Firma": "Company",
  "Mandant": "Tenant",
  "Mandanten": "Tenants",
  "Benutzer": "User",
  "Benutzerkonto": "User account",
  "Rolle": "Role",
  "Rollen": "Roles",
  "Name": "Name",
  "E-Mail": "Email",
  "Telefon": "Phone",
  "Standort": "Location",
  "Aktion": "Action",
  "Aktionen": "Actions",
  "Status": "Status",
  "Datum": "Date",
  "Uhrzeit": "Time",
  "Tag": "Day",
  "Woche": "Week",
  "Monat": "Month",
  "Jahr": "Year",
  "Übersicht": "Overview",
  "Abmelden": "Sign out",
  "Anmelden": "Sign in",
  "Passwort": "Password",
  "Zugang": "Access",
  "Sperren": "Suspend",
  "Entsperren": "Unsuspend",
  "Gesperrt": "Suspended",
  "Aktiv": "Active",
  "Inaktiv": "Inactive",
  "Details": "Details",
  "Schließen": "Close",
  "Speichern und schließen": "Save and close",
  "Hinzufügen": "Add",
  "Entfernen": "Remove",
  
  // Specific sentences from grep
  "⚠ Keine QR-IBAN in den Firmen-Einstellungen — bitte ergänzen.": "⚠ No QR-IBAN in company settings — please add.",
  "Sind Sie sicher?": "Are you sure?",
  "Diese Aktion kann nicht rückgängig gemacht werden.": "This action cannot be undone.",
  "Möchten Sie diesen Eintrag wirklich löschen?": "Do you really want to delete this entry?",
  "Ja, löschen": "Yes, delete",
  "Nein, abbrechen": "No, cancel",

  // Roles & Permissions
  "Berechtigungen": "Permissions",
  "Zugriff": "Access",
  "Lesen": "Read",
  "Schreiben": "Write",
  "Verwalten": "Manage",

  // Other words
  "Stammdaten": "Master data",
  "Rechnung": "Invoice",
  "Rechnungen": "Invoices",
  "Angebot": "Quote",
  "Angebote": "Quotes",
  "Kunde": "Customer",
  "Kunden": "Customers",
  "Mitarbeiter": "Employee",
  "Maschine": "Machine",
  "Maschinen": "Machines",
  "Auftrag": "Order",
  "Aufträge": "Orders",
  "Urlaub": "Vacation",
  "Absenzen": "Absences",
  "Feiertage": "Holidays",
  "Berichte": "Reports",
  "System": "System",
  "Keine Daten vorhanden": "No data available",
  "Keine Einträge": "No entries",
  "Laden...": "Loading...",
  "Bitte warten": "Please wait"
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // We only replace exact words inside quotes or JSX text to avoid variable renaming.
  // JSX text e.g. >Speichern<
  // Quotes e.g. "Speichern" or 'Speichern'
  
  for (const [de, en] of Object.entries(dictionary)) {
    // Escape special regex chars in DE string
    const escapedDe = de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Replace inside double quotes
    content = content.replace(new RegExp(`"${escapedDe}"`, 'g'), `"${en}"`);
    // Replace inside single quotes
    content = content.replace(new RegExp(`'${escapedDe}'`, 'g'), `'${en}'`);
    // Replace inside backticks
    content = content.replace(new RegExp(`\\\`${escapedDe}\\\``, 'g'), `\\\`${en}\\\``);
    // Replace in JSX between tags
    content = content.replace(new RegExp(`>\\s*${escapedDe}\\s*<`, 'g'), `>${en}<`);
    // Replace in JSX between tag and expression
    content = content.replace(new RegExp(`>\\s*${escapedDe}\\s*\\{`, 'g'), `>${en}{`);
    // Replace in JSX between expression and tag
    content = content.replace(new RegExp(`\\}\\s*${escapedDe}\\s*<`, 'g'), `}${en}<`);
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Translated strings in: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(file)) {
        walkDir(p);
      }
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      processFile(p);
    }
  }
}

walkDir(path.join(process.cwd(), 'app'));
walkDir(path.join(process.cwd(), 'components'));
walkDir(path.join(process.cwd(), 'lib'));
console.log('Translation script completed.');
