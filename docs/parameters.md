# System-Parameter — CEO-editierbare Werte

> Alle Standardzeiten, Ofentemperaturen, Multiplikatoren und Stundensätze leben in der `SystemParameter`-Tabelle. **Kein einziger** dieser Werte ist im Code als TypeScript-`const` hinterlegt — Berechnungs-Funktionen lesen ausschliesslich aus `lib/domain/parameters/store.ts`.

## Anzahl Parameter (Phase 1 Seed)

71 Parameter — generiert aus `lib/domain/parameters/seeds.ts`. Volle Liste in der DB unter `/admin/parameters` (UI folgt in Phase 2.5).

## Kategorien

| Kategorie | Beispiele | Anzahl Defaults |
|---|---|---|
| **PROCESS_TIME** | `process.BLAST_SA25.minutesPerM2` (7.5), `process.PC_APPLICATION.minutesPerM2` (1.5) | 22 |
| **CURING** | `curing.polyester-standard.ovenTempC` (180), `cureMinutes` (15), `heatupMinutes` (10), `cooldownMinutes` (30); 3 Profile + globaler Aufheiz-Faktor | 13 |
| **DRYING** | `drying.top2k.rtMinutes` (720), `drying.top2k.ovenMinutes` (30); 4 Lacktypen × 2 Modi | 8 |
| **MATERIAL** | `material.STAINLESS.factor` (1.25), `material.ALUMINIUM.factor` (0.85) | 7 |
| **COMPLEXITY** | `complexity.COMPLEX.factor` (1.4), `complexity.VERY_COMPLEX.factor` (1.8) | 4 |
| **PRICING_RATE** | `pricing.rate.machine.POWDER_CABIN` (150 CHF/h), `pricing.rate.labor.standard` (95 CHF/h) | 7 |
| **PRICING_SURCHARGE** | `pricing.surcharge.express.percent` (35), `pricing.surcharge.minOrder.CHF` (80) | 3 |
| **SCHEDULER** | `scheduler.safetyBufferMinutes` (240), `scheduler.powderChangePenaltyMin` (30) | 3 |
| **TAX** | `tax.vat.standard.percent` (8.10), `tax.vat.reduced.percent` (2.60) | 3 |
| **WORKING_HOURS** | `process.WP_TOP_2K.potLifeHours` (6) | 1 |

## Naming-Konventionen

Dotted-Key, immer in der Form `<category>.<subKey>.<field>`:

```
process.<ProcessCode>.minutesPerM2     // Strahlen Sa 2.5: process.BLAST_SA25.minutesPerM2
process.<ProcessCode>.flatMinutes      // QC: process.QUALITY_CHECK.flatMinutes
curing.<profile>.ovenTempC             // curing.polyester-standard.ovenTempC
material.<Material>.factor             // material.STAINLESS.factor
complexity.<level>.factor              // complexity.COMPLEX.factor
pricing.rate.machine.<MachineType>     // pricing.rate.machine.POWDER_CABIN
pricing.rate.labor.standard            // Standard-Stundensatz Mitarbeiter
pricing.surcharge.<key>.<unit>         // pricing.surcharge.express.percent
scheduler.<key>                        // scheduler.safetyBufferMinutes
tax.vat.<variant>.percent              // tax.vat.standard.percent
```

## Berechnungs-Formeln

### Schritt-Dauer
```
calcProcessStepMinutes:
  surface-based:  ceil(surfaceM2 × baseMinPerM2 × materialFactor × complexityFactor)
  flat-based:     flatMinutes  (× complexityFactor nur bei TOUCHUP)
```

| Faktor angewendet auf | ProcessCodes |
|---|---|
| `material.<X>.factor` | nur Strahl- + Vorbehandlungsschritte |
| `complexity.<X>.factor` | nur `MASKING`, `MOUNTING`, `UNMASKING`, `TOUCHUP` |

### Aushärtungs-Profil
```
calcCuringProfile:
  heatup    = baseHeatup + thicknessMm × heatupPerMm
  cure      = curing.<profile>.cureMinutes
  cooldown  = curing.<profile>.cooldownMinutes
  total     = heatup + cure + cooldown
  ovenTempC = curing.<profile>.ovenTempC
```

### Auftragspreis
```
calcOrderItemPrice:
  net      = Σ (steps[i].minutes / 60 × rate(i))
  rate(i)  = machineType ? pricing.rate.machine.<TYPE> : pricing.rate.labor.standard
  express  = isExpress ? net × pricing.surcharge.express.percent / 100 : 0
  discount = (net + express) × customerDiscountPct / 100
  total    = net + express − discount
```

## Snapshot-Regeln (Datenintegrität)

| Status | Modus |
|---|---|
| `Order.DRAFT`, `Quote.DRAFT` | LIVE — liest aktuelle Parameter beim Öffnen, Banner bei Änderung |
| `Order.CONFIRMED`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`, `DELIVERED`, `INVOICED` | SNAPSHOT — Werte aus `Order.parameterSnapshot` |
| `Quote.SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED` | SNAPSHOT — Werte aus `Quote.parameterSnapshot` |

**Welche Keys werden gesnapshottet?** `snapshotKeys()` in `lib/domain/parameters/store.ts` filtert auf:
`process.*`, `curing.*`, `drying.*`, `material.*`, `complexity.*`, `pricing.*`, `tax.*`.

Scheduler-Heuristiken (`scheduler.*`) bleiben **nicht** im Snapshot, da sie Planungsverhalten betreffen, nicht Auftragsabrechnung.

## Pflicht-Audit bei jeder Änderung

Jede Änderung an einem Parameter erzeugt einen `ParameterChangeLog`-Eintrag mit:
- `oldValue` / `newValue` (als String, JSON-serialisiert)
- `changedById` (welcher User)
- **`reason`** — PFLICHTFELD, vom UI erzwungen
- `effectiveAt` (Zeitstempel)

Zusätzlich landet ein `AuditLog` mit `action: PARAMETER_UPDATE`, `entityType: "SystemParameter"`, `entityId: parameterKey`.

## Min/Max-Validierung

Jeder Parameter hat `minValue` und `maxValue` (z. B. Ofentemperatur 100–250 °C). Hard-Block + UI-Warnung bei Out-of-Range. Schritt-Inkrement (`step`) steuert das UI-Stepper-Verhalten.

## Beispiel: CEO ändert Pulver-Aushärtung

**Szenario** (Briefing 4.6.9): CEO ändert `curing.polyester-standard.ovenTempC` von 180 auf 190 °C und `cureMinutes` von 15 auf 12 Min mit Begründung "Neuer Pulverlieferant XY-Polyester".

1. UI-Live-Vorschau zeigt: *"4 offene DRAFT-Aufträge: ⌀ −3 Min Durchlaufzeit, −7.50 CHF/Auftrag"*
2. Speichern erzeugt **2 ParameterChangeLog-Einträge** mit `reason`
3. `4 DRAFT-Aufträge` zeigen beim nächsten Öffnen aktualisierte Werte mit Banner *"Parameter geändert"*
4. `12 CONFIRMED/IN_PROGRESS-Aufträge` bleiben **unverändert** (Snapshot-Schutz)
5. Werkstatt-View für neue Schritte zeigt 190 °C / 12 Min
6. Audit-Log unter `/admin/audit` listet die Änderung

## Reset auf Default

Jeder Parameter hat ein `defaultValue` (Ursprung aus `seeds.ts`). UI-Button "Auf Default zurücksetzen" → setzt `currentValue = defaultValue`, `ParameterChangeLog` wird mit `reason: "Reset auf Default"` erzeugt.

## Bulk-Edit (Phase 2.5 UI)

Excel-Import/-Export geplant für:
- Pulverlieferanten-Wechsel (alle `curing.*`-Werte auf einen Schlag)
- Tarif-Anpassung (alle `pricing.rate.*`-Werte)
- Quartals-Review (alle `process.*.minutesPerM2`-Werte aus dem Plan-Ist-Vergleich)

Validierung pro Zeile, Diff-Vorschau, Pflicht-`reason` für die ganze Charge.
