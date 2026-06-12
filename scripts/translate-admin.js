const fs = require('fs');
const path = require('path');

const dictionary = {
  // admin/page.tsx
  "Stand: ": "As of: ",
  "Auto-Refresh alle 15 s": "Auto-refresh every 15 s",
  "Geschäft —": "Business —",
  "Geschäft": "Business",
  "Umsatz Monat": "Monthly Revenue",
  "vs.": "vs.",
  "Vormonat": "Previous month",
  "kein Vormonats-Vergleich": "no previous month comparison",
  "Offene Forderungen": "Outstanding Claims",
  "alle Rechnungen bezahlt": "all invoices paid",
  "offen, davon": "open, thereof",
  "überfällig": "overdue",
  "Aktive Aufträge": "Active Orders",
  "keine aktiven Aufträge": "no active orders",
  "in Arbeit": "in progress",
  "bestätigt": "confirmed",
  "Offerten im Umlauf": "Quotes in Circulation",
  "keine offenen Offerten": "no open quotes",
  "Gesamtwert": "Total Value",
  "Werkstatt heute": "Workshop Today",
  "Eingestempelt": "Clocked In",
  "niemand aktuell anwesend": "no one currently present",
  "von": "of",
  "aktiven Mitarbeitern": "active employees",
  "In Pause": "On Break",
  "Warnungen": "Warnings",
  "alles im grünen Bereich": "everything in the green",
  "siehe unten": "see below",
  "Heute total": "Today Total",
  "geleistete Arbeitszeit": "hours worked",
  "Personal-Warnungen": "Staff Warnings",
  "Seit": "Since",
  "Heute": "Today",
  "Week": "Week",
  "Saldo": "Balance",
  "Du hast aktuell keine Zugriffsrechte für die Dashboard-Ansicht.": "You currently have no access rights for the dashboard view.",
  "Wende dich an den Super-Admin.": "Contact the super-admin.",
  "Fehlende Ausstempelung": "Missing clock-out",
  "Langer Arbeitstag": "Long workday",
  "Fehlende Pause": "Missing break",
  "Hohe Überstunden": "High overtime",
  "Negativer Saldo": "Negative balance",
  "Ausgestempelt": "Clocked Out",
  "Abwesend": "Absent",

  // Customers
  "CRM — Stammdaten, Adressen, Kontakte": "CRM — Master data, addresses, contacts",
  "Neuer Kunde": "New Customer",
  "Firmenname": "Company Name",
  "Kundennummer": "Customer Number",
  "Vorname": "First Name",
  "Nachname": "Last Name",
  "E-Mail": "Email",
  "Telefon": "Phone",
  "Sprache": "Language",
  "Straße": "Street",
  "PLZ": "ZIP",
  "Ort": "City",
  "Land": "Country",
  "Privat": "Private",
  "Geschäftlich": "Business",
  "Alle": "All",
  "Aktiv": "Active",
  "Archiviert": "Archived",
  "Gelöscht": "Deleted",
  "Suchen...": "Search...",
  "Kundenliste": "Customer List",
  "Typ": "Type",

  // Quotes
  "Offen": "Open",
  "Angenommen": "Accepted",
  "Abgeschlossen": "Closed",
  "Offerten": "Quotes",
  "Angebote erstellen, versenden und in Aufträge umwandeln.": "Create, send and convert quotes into orders.",
  "Neue Offerte": "New Quote",

  // Orders
  "Aufträge erfassen, bestätigen, planen und ausliefern.": "Create, confirm, plan and deliver orders.",
  "Neuer Auftrag": "New Order",

  // Invoices
  "Bezahlt": "Paid",
  "Storniert": "Cancelled",
  "Schweizer QR-Rechnungen erstellen, versenden und Zahlungen erfassen.": "Create and send Swiss QR invoices, and record payments.",
  "Neue Rechnung": "New Invoice",

  // Templates
  "Process-Vorlagen": "Process Templates",
  "Standard-Workflows für Aufträge und Offerten. Änderungen wirken sofort auf neue Aufträge / Offerten — bestehende bleiben unverändert.": "Standard workflows for orders and quotes. Changes immediately affect new orders / quotes — existing ones remain unchanged.",
  "Neue Vorlage": "New Template",
  "Keine Vorlagen in dieser Ansicht.": "No templates in this view.",

  // General Admin missing stuff
  "Dashboard": "Dashboard",
  "Einstellungen": "Settings",
  "Benutzer": "Users",
  "Abmelden": "Logout",
  "Profil": "Profile"
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  for (const [de, en] of Object.entries(dictionary)) {
    const escapedDe = de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`"${escapedDe}"`, 'g'), `"${en}"`);
    content = content.replace(new RegExp(`'${escapedDe}'`, 'g'), `'${en}'`);
    content = content.replace(new RegExp(`\\\`${escapedDe}\\\``, 'g'), `\\\`${en}\\\``);
    content = content.replace(new RegExp(`>\\s*${escapedDe}\\s*<`, 'g'), `>${en}<`);
    content = content.replace(new RegExp(`>\\s*${escapedDe}\\s*\\{`, 'g'), `>${en}{`);
    content = content.replace(new RegExp(`\\}\\s*${escapedDe}\\s*<`, 'g'), `}${en}<`);
    content = content.replace(new RegExp(`>\\s*${escapedDe}`, 'g'), `>${en}`);
    content = content.replace(new RegExp(`${escapedDe}\\s*<`, 'g'), `${en}<`);
  }

  // Handle some specific inline JSX text replacements that the regex might miss
  Object.keys(dictionary).forEach(de => {
      const en = dictionary[de];
      // Simple raw string replace for cases like:  Mitarbeiter — {formatDateCH(new Date())}
      if (de === "Geschäft —") content = content.replace(/Geschäft —/g, "Business —");
      if (de === "Stand: ") content = content.replace(/Stand:/g, "As of:");
      if (de === "Auto-Refresh alle 15 s") content = content.replace(/Auto-Refresh alle 15 s/g, "Auto-refresh every 15 s");
      if (de === "Mitarbeiter —") content = content.replace(/Mitarbeiter —/g, "Employees —");
  });

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

walkDir(path.join(process.cwd(), 'app', 'admin'));
walkDir(path.join(process.cwd(), 'components', 'admin'));
walkDir(path.join(process.cwd(), 'components', 'dashboard'));
console.log('Admin Translation script completed.');
