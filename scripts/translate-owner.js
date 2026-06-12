const fs = require('fs');
const path = require('path');

const dictionary = {
  // Navigation & General
  "Registrierungen": "Registrations",
  "Audit-Log": "Audit Log",
  "Diagnose": "Diagnostics",
  "System": "System",
  "Owner-Team": "Owner Team",
  "Billing": "Billing",
  "Mein Profil": "My Profile",
  "Operativ": "Operational",
  "Plattform": "Platform",
  "Mandant": "Tenant",
  "Mandanten": "Tenants",
  "Benutzer": "User",
  "Rolle": "Role",
  "Name": "Name",
  "E-Mail": "Email",
  "Telefon": "Phone",
  "Standort": "Location",
  "Aktion": "Action",
  "Status": "Status",
  "Datum": "Date",
  "Uhrzeit": "Time",
  "Übersicht": "Overview",
  
  // Dashboard & Audit
  "Willkommen": "Welcome",
  "Aktive User": "Active Users",
  "über alle Mandanten": "across all tenants",
  "Impersonation aktiv": "Impersonation active",
  "Platzhalter": "Placeholder",
  "Letzte Audit-Events": "Recent Audit Events",
  "Einträge": "entries",
  "Noch keine Audit-Events. Erste Aktionen werden hier nach dem Login sichtbar.": "No audit events yet. Initial actions will be visible here after login.",
  
  // Magic Links & Password Reset
  "Magic-Link an Admin senden": "Send magic link to admin",
  "Admin erhält Reset-Mail (1h gültig), setzt Passwort selbst.": "Admin receives reset mail (valid 1h), sets password themselves.",
  "Temporäres Passwort generieren": "Generate temporary password",
  "Wird einmalig angezeigt. Du übermittelst es persönlich.": "Shown once. You transmit it personally.",
  "Der Mandant wird direkt aktiv geschaltet (Owner vouched). Der erste Admin\\n                bekommt automatisch SUPERADMIN-Rechte für seinen Mandanten.": "Tenant is activated directly. First admin automatically gets SUPERADMIN rights.",
  "Mandant angelegt — Admin-Passwort": "Tenant created — Admin password",
  "Übermittle das Passwort jetzt direkt an": "Transmit the password directly to",
  "Nach Schliessen ist es weg.": "After closing it is gone.",
  "Der Admin muss beim ersten Login ein neues Passwort setzen.": "Admin must set a new password on first login.",
  "Mail an": "Mail to",
  "ist raus. Link ist 1h gültig.": "is sent. Link is valid for 1h.",
  "Mail-Versand an": "Mail delivery to",
  "ist fehlgeschlagen. Du\\n              kannst aus der User-Liste \"Passwort-Reset-Mail senden\" erneut auslösen.": "failed. You can resend the password reset mail from the user list.",
  "Magic-Link an User senden": "Send magic link to user",
  "User erhält Mail mit Reset-Link (1h gültig) und setzt das Passwort selbst.": "User receives mail with reset link (valid 1h) and sets password themselves.",
  "User angelegt — temporäres Passwort": "User created — temporary password",
  "Der User muss beim ersten Login ein neues Passwort setzen.": "User must set a new password on first login.",
  "ist raus. Der Link ist 1 Stunde\\n              gültig.": "is sent. The link is valid for 1 hour.",
  "ist fehlgeschlagen.": "failed.",
  "Der User wurde trotzdem angelegt. Du kannst aus der User-Liste \"Passwort-Reset-Mail\\n                senden\" erneut auslösen.": "User was created anyway. You can resend the password reset mail from the user list.",
  "Temporäres Passwort": "Temporary password",
  "Der User wird beim nächsten Login zwingend ein neues Passwort setzen müssen.": "User will be forced to set a new password on next login.",
  
  // Deletion
  "Endgültig löschen": "Delete permanently",
  "Mandant unwiderruflich löschen": "Delete tenant irrevocably",
  "allen Daten": "all data",
  "allen Benutzerkonten": "all user accounts",
  "endgültig entfernt.\\n                  Das kann": "permanently removed. This can",
  "nicht rückgängig": "not be undone",
  "gemacht werden.": ".",
  "Unwiderruflich löschen": "Delete irrevocably",
  "Bestätigen": "Confirm",
  
  // Health & Diagnostics
  "Gelöst": "Resolved",
  "Ignorieren": "Ignore",
  "Alle Status": "All statuses",
  "Krit.": "Crit.",
  "Warn.": "Warn.",
  "Letzte Prüfung": "Last check",
  "Details": "Details",
  "Prüfen": "Check",
  "Keine Mandanten.": "No tenants.",
  "Test-E-Mail": "Test Email",
  
  // Modules & Limits
  "Module & Limits": "Modules & Limits",
  "Standardmäßig bestimmt der": "By default, the",
  "die Module. Ein Plan-Wechsel\\n          aktiviert/deaktiviert sie automatisch. Hier kannst du einzelne Module zusätzlich\\n          manuell übersteuern — diese Sonderfälle": "determines the modules. Changing plans activates/deactivates them automatically. Here you can manually override individual modules — these special cases",
  "bleiben auch bei einem\\n          Plan-Wechsel erhalten": "persist even when changing plans",
  ". Änderungen wirken sofort und werden auditiert.": ". Changes take effect immediately and are audited.",
  "Nicht im Plan": "Not in plan",
  "Modul aktiviert": "Module activated",
  "Limit / Monat": "Limit / month",
  "Wert setzen …": "Set value ...",
  
  // Impersonation
  "Anmelden als": "Sign in as",
  ". Der Kunde muss\\n            den Code persönlich weitergeben, bevor die Sitzung startet.": ". The customer must pass the code personally before the session starts.",
  "Berechtigung": "Permission",
  "Nur Lesen": "Read only",
  "Vollzugriff": "Full access",
  "Maximale Dauer": "Max duration",
  "Code senden": "Send code",
  "Code wurde gesendet": "Code sent",
  "Bitte den Code mündlich vom Kunden erfragen und hier eintippen.\\n            Der Code wurde nirgendwo sonst angezeigt — er lebt ausschließlich\\n            in der E-Mail des Kunden.": "Please ask the customer for the code verbally and type it here. The code is not shown anywhere else — it lives exclusively in the customer's email.",
  "6-stelliger Bestätigungscode": "6-digit confirmation code",
  "Sitzung starten": "Start session",
  
  // Actions & States
  "Interne Notizen": "Internal notes",
  "— nur Owner sichtbar": "— visible only to Owner",
  "Gespeichert": "Saved",
  "Deaktivieren": "Deactivate",
  "Aktivieren": "Activate",
  "Neue Rolle": "New role",
  "Passwort wurde aktualisiert.": "Password updated.",
  "Passwort ändern": "Change password",
  "Plan ändern": "Change plan",
  "Aktueller Plan:": "Current plan:",
  ".\\n                Die plan-gesteuerten Module passen sich beim Wechsel an. Manuelle\\n                Sonderfreischaltungen/-sperren und bestehende Daten bleiben unangetastet.": ". Plan-controlled modules adjust upon change. Manual overrides and existing data remain untouched.",
  "Neuer Plan": "New plan",
  "Plan wechseln": "Switch plan",
  "Freigeben": "Approve",
  "Ablehnen": "Reject",
  "Begründung wird dem Antragsteller per Mail mitgeteilt.": "Reason will be sent to applicant via email.",
  "Andere Sitzungen beenden": "End other sessions",
  "Aktuelles Passwort": "Current password",
  "Sitzungen beenden": "End sessions",
  
  // Master data
  "Stammdaten bearbeiten": "Edit master data",
  "Step-up Bestätigung": "Step-up confirmation",
  "Bitte gib dein Owner-Passwort erneut ein. Der Sudo-Modus bleibt anschliessend 5 Minuten aktiv.": "Please re-enter your owner password. Sudo mode will remain active for 5 minutes.",
  "Notfall-Zugang (Authenticator-App)": "Emergency access (Authenticator app)",
  "Reiner Wiederherstellungs-Faktor gegen Aussperren. Der Passkey\\n            bleibt Pflicht — ein TOTP-Code gewährt": "Pure recovery factor against lockouts. The passkey remains mandatory — a TOTP code grants",
  "keinen": "no",
  "Eingerichtet": "Configured",
  "Neu einrichten": "Set up new",
  "Notfall-Zugang einrichten": "Set up emergency access",
  "1. Scanne den QR-Code mit deiner Authenticator-App (Google\\n                Authenticator, 1Password, Authy …) oder gib den Schlüssel\\n                manuell ein.": "1. Scan the QR code with your authenticator app (Google Authenticator, 1Password, Authy...) or enter the key manually.",
  "2. Gib zur Bestätigung den aktuellen 6-stelligen Code ein:": "2. Enter the current 6-digit code to confirm:",
  "Bestätigen & aktivieren": "Confirm & activate",
  "Keine Änderung — andere Rolle wählen.": "No change — select different role."
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  for (const [de, en] of Object.entries(dictionary)) {
    // We treat the keys as plain text and replace globally, except we don't want to replace partial word matches if it's risky, but since these are full phrases, global replace is fine.
    // Replace newlines in dictionary keys with actual regex matches for whitespace
    const searchRegex = new RegExp(de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\n/g, '\\s*\\n\\s*'), 'g');
    content = content.replace(searchRegex, en);
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

walkDir(path.join(process.cwd(), 'app/owner'));
walkDir(path.join(process.cwd(), 'components/owner'));
console.log('Advanced owner translation script completed.');
